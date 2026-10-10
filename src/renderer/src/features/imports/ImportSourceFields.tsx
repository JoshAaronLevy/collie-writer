import { TextInput } from '@mantine/core'
import { SOURCE_TYPES, type SourceMetadata } from '../../../../shared/sources'
import { AppButton, SelectField } from '../../components/ui/Controls'
import styles from './ImportProvider.module.css'
const empty: SourceMetadata = {
  type: 'webpage',
  title: '',
  author: [],
  issued: '',
  containerTitle: '',
  publisher: '',
  edition: '',
  volume: '',
  issue: '',
  page: '',
  DOI: '',
  URL: '',
  ISBN: '',
  ISSN: ''
}
const fields = [
  ['issued', 'Publication date'],
  ['containerTitle', 'Journal / collection'],
  ['publisher', 'Publisher'],
  ['edition', 'Edition'],
  ['volume', 'Volume'],
  ['issue', 'Issue'],
  ['page', 'Pages'],
  ['DOI', 'DOI'],
  ['URL', 'URL'],
  ['ISBN', 'ISBN'],
  ['ISSN', 'ISSN']
] as const
export function ImportSourceFields({
  value,
  disabled,
  onChange
}: {
  value: SourceMetadata | null
  disabled: boolean
  onChange: (value: SourceMetadata) => void
}): React.JSX.Element {
  const metadata = value ?? empty
  return (
    <fieldset className={styles.preview} disabled={disabled}>
      <legend>Reviewed source metadata</legend>
      <p>
        Missing original fields remain unknown until you supply them. These corrections do not
        verify the source.
      </p>
      <SelectField
        label="Work type"
        value={metadata.type}
        data={[...SOURCE_TYPES]}
        onChange={(e) =>
          onChange({ ...metadata, type: e.currentTarget.value as SourceMetadata['type'] })
        }
      />
      <TextInput
        label="Source title"
        value={metadata.title}
        maxLength={2000}
        onChange={(e) => onChange({ ...metadata, title: e.currentTarget.value })}
      />
      <details>
        <summary>Authors and publication fields</summary>
        {metadata.author.map((a, i) => (
          <fieldset key={i}>
            <legend>Author {i + 1}</legend>
            {(['family', 'given', 'literal'] as const).map((key) => (
              <TextInput
                key={key}
                label={
                  key === 'literal'
                    ? 'Literal / organization name'
                    : key === 'family'
                      ? 'Family name'
                      : 'Given name'
                }
                maxLength={key === 'literal' ? 600 : 300}
                value={a[key]}
                onChange={(e) =>
                  onChange({
                    ...metadata,
                    author: metadata.author.map((old, at) =>
                      at === i ? { ...old, [key]: e.currentTarget.value } : old
                    )
                  })
                }
              />
            ))}
            <AppButton
              variant="subtle"
              onClick={() =>
                onChange({ ...metadata, author: metadata.author.filter((_, at) => at !== i) })
              }
            >
              Remove author {i + 1}
            </AppButton>
          </fieldset>
        ))}
        <AppButton
          variant="subtle"
          disabled={disabled || metadata.author.length >= 100}
          onClick={() =>
            onChange({
              ...metadata,
              author: [...metadata.author, { family: '', given: '', literal: '' }]
            })
          }
        >
          Add author
        </AppButton>
        {fields.map(([key, label]) => (
          <TextInput
            key={key}
            label={label}
            maxLength={
              ['issued', 'edition', 'volume', 'issue', 'page', 'ISBN', 'ISSN'].includes(key)
                ? 100
                : 2000
            }
            value={metadata[key]}
            onChange={(e) => onChange({ ...metadata, [key]: e.currentTarget.value })}
          />
        ))}
      </details>
    </fieldset>
  )
}
