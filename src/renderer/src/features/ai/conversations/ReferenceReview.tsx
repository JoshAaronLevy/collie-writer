import { Checkbox, TextInput } from '@mantine/core'
import { AppDialog } from '../../../components/ui/AppDialog'
import { AppButton, SelectField } from '../../../components/ui/Controls'
import { SOURCE_TYPES, type SourceMetadata } from '../../../../../shared/sources'
import { useConversations } from './conversationState'
import { useWorkspaceSession } from '../../workspace/workspaceContext'

export function ReferenceReview(): React.JSX.Element {
  const r = useConversations().references,
    session = useWorkspaceSession(),
    d = r.draft
  const locked = r.busy || !!r.pending || !!r.receipt || r.unavailable
  const field = (
    key: keyof Omit<SourceMetadata, 'author' | 'type'>,
    label: string
  ): React.JSX.Element => (
    <TextInput
      key={key}
      label={label}
      value={d?.metadata[key] ?? ''}
      maxLength={2000}
      onChange={(e) => {
        if (d) r.update({ ...d.metadata, [key]: e.currentTarget.value })
      }}
    />
  )
  return (
    <AppDialog
      opened={r.opened && !!d}
      title="Save reference"
      onClose={r.dismiss}
      dismissible={!r.busy}
      onExited={r.deliverCitation}
      returnFocus={!r.receipt}
    >
      {d ? (
        <div
          {...r.draftEvents}
          onCompositionStart={r.startComposition}
          onCompositionEnd={r.endComposition}
        >
          {r.issue ? <p role="alert">{r.issue}</p> : null}
          {r.receipt ? (
            <>
              <p role="status">
                {r.receipt.existingSourceId
                  ? 'Linked to the existing source in Research. Its metadata was kept.'
                  : 'Saved in Research.'}
              </p>
              <AppButton onClick={() => void r.cite(r.receipt!.sourceId)} disabled={r.unavailable}>
                Cite in writing
              </AppButton>
              <AppButton
                variant="subtle"
                onClick={() => {
                  const id = r.receipt!.sourceId
                  r.discard()
                  session.research({ kind: 'sources', sourceId: id })
                }}
              >
                Open source
              </AppButton>
              <AppButton variant="subtle" onClick={r.discard}>
                Done
              </AppButton>
            </>
          ) : (
            <>
              <p>
                {d.origin.reference.kind === 'web'
                  ? 'Reference supplied by ChatGPT. Review its citation details before saving.'
                  : 'Selected answer text is an unverified suggestion. Check the title and source type.'}{' '}
                Only the title is required.
              </p>
              {d.origin.reference.kind === 'text' ? (
                <details>
                  <summary>Original answer text</summary>
                  <blockquote>{d.origin.reference.text}</blockquote>
                </details>
              ) : null}
              <fieldset disabled={locked}>
                <SelectField
                  label="Source type"
                  value={d.metadata.type}
                  onChange={(e) =>
                    r.update({
                      ...d.metadata,
                      type: e.currentTarget.value as SourceMetadata['type']
                    })
                  }
                >
                  {SOURCE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type === 'article-journal'
                        ? 'Journal article'
                        : type === 'webpage'
                          ? 'Web page'
                          : type[0].toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </SelectField>
                {field('title', 'Title')}
                <TextInput
                  label="Authors (optional: Family, Given; separate with semicolons)"
                  value={d.authors}
                  maxLength={2000}
                  onChange={(e) =>
                    r.update(
                      {
                        ...d.metadata,
                        author: e.currentTarget.value
                          .split(';')
                          .map((a) => a.trim())
                          .filter(Boolean)
                          .map((a) => {
                            const [family, ...given] = a.split(',')
                            return given.length
                              ? {
                                  family: family.trim(),
                                  given: given.join(',').trim(),
                                  literal: ''
                                }
                              : { literal: a, given: '', family: '' }
                          })
                      },
                      d.verified,
                      e.currentTarget.value
                    )
                  }
                />
                {field('issued', 'Year or date (optional)')}
                {d.metadata.type === 'webpage' ? field('URL', 'URL') : null}
                <details>
                  <summary>More citation details</summary>
                  {d.metadata.type !== 'webpage' ? field('URL', 'URL') : null}
                  {field('DOI', 'DOI')}
                  {field('ISBN', 'ISBN')}
                  {field('containerTitle', 'Journal or collection')}
                  {field('publisher', 'Publisher')}
                  {field('edition', 'Edition')}
                  {field('volume', 'Volume')}
                  {field('issue', 'Issue')}
                  {field('page', 'Pages')}
                  {field('ISSN', 'ISSN')}
                </details>
                <Checkbox
                  label="I checked these details against the source"
                  checked={d.verified}
                  onChange={(e) => r.update(d.metadata, e.currentTarget.checked)}
                />
              </fieldset>
              <p>No original file or verified quotation is added.</p>
              {r.pending ? (
                <AppButton disabled={r.busy || r.unavailable} onClick={() => void r.save(null)}>
                  Retry this save
                </AppButton>
              ) : r.candidates === null ? (
                <AppButton
                  disabled={locked || !d.metadata.title.trim()}
                  onClick={() => void r.check()}
                >
                  Continue
                </AppButton>
              ) : (
                <>
                  {r.candidates.length ? (
                    <>
                      <p>These sources may already match:</p>
                      <ul>
                        {r.candidates.map((c) => (
                          <li key={c.id}>
                            {c.title} · {c.reason}{' '}
                            <AppButton
                              size="compact-sm"
                              variant="subtle"
                              disabled={locked}
                              onClick={() => void r.save(c.id)}
                            >
                              Use existing
                            </AppButton>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p>No matching source found.</p>
                  )}
                  <AppButton disabled={locked} onClick={() => void r.save(null)}>
                    {r.candidates.length ? 'Save as a separate source' : 'Add to Research'}
                  </AppButton>
                </>
              )}
              <AppButton variant="subtle" disabled={r.busy} onClick={r.dismiss}>
                Keep for later
              </AppButton>
              <AppButton variant="subtle" disabled={r.busy || !!r.pending} onClick={r.discard}>
                Discard review
              </AppButton>
            </>
          )}
        </div>
      ) : null}
    </AppDialog>
  )
}
