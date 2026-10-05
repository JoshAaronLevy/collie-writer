import { useEffect, useState } from 'react'
import { TextInput } from '@mantine/core'
import { requiredProjectName } from '../../../../domain/projects/details'
import { AppButton } from '../../components/ui/Controls'
import { AUTHOR_CHANGED, readAuthorPreference, writeAuthorPreference } from './setup-draft'
import styles from './AuthorPreferenceSettings.module.css'

export default function AuthorPreferenceSettings(): React.JSX.Element {
  const [stored, setStored] = useState(readAuthorPreference)
  const [value, setValue] = useState(stored.byline)
  const [issue, setIssue] = useState<string | null>(stored.issue)
  useEffect(() => {
    const changed = (): void => {
      const next = readAuthorPreference()
      setStored(next)
      setValue(next.byline)
      setIssue(next.issue)
    }
    window.addEventListener(AUTHOR_CHANGED, changed)
    return () => window.removeEventListener(AUTHOR_CHANGED, changed)
  }, [])
  const valid = value === '' || requiredProjectName(value.trim())
  function save(): void {
    if (!valid) return
    const next = value.trim()
    if (!writeAuthorPreference(next)) {
      setIssue('The author preference could not be saved in this app profile. Try again later.')
      return
    }
    setStored({ byline: next, issue: null })
    setValue(next)
    setIssue(null)
  }
  return (
    <section
      className={styles['author-preference-settings']}
      aria-labelledby="author-preference-heading"
    >
      <h3 id="author-preference-heading">Default author for new projects</h3>
      <p>
        Keep a name or shared byline on this computer. It fills future setup forms; each project
        still has its own editable author.
      </p>
      <TextInput
        label="Remembered author / byline"
        value={value}
        error={
          !valid ? 'Use 1–500 characters without line breaks or control characters.' : undefined
        }
        errorProps={{ role: 'alert' }}
        onChange={(event) => setValue(event.currentTarget.value)}
      />
      <div className={styles['author-preference-actions']}>
        <AppButton disabled={!valid || (value === stored.byline && !issue)} onClick={save}>
          Save author preference
        </AppButton>
        <AppButton
          variant="default"
          disabled={!stored.byline && !value && !issue}
          onClick={() => {
            if (writeAuthorPreference('')) {
              setStored({ byline: '', issue: null })
              setValue('')
              setIssue(null)
            } else setIssue('The author preference could not be cleared. Try again later.')
          }}
        >
          Clear remembered author
        </AppButton>
      </div>
      {issue ? <p role="alert">{issue}</p> : null}
    </section>
  )
}
