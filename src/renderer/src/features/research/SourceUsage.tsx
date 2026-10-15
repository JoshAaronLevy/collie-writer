import { AppButton } from '../../components/ui/Controls'
import { useWorkspaceSession } from '../workspace/workspaceContext'
import { useResearchData } from './researchContext'
import { linkWarnings, sectionPath, sourceCounts } from './usage'
import './SourceUsage.css'

export function UsageSummary({ sourceId }: { sourceId: string }): React.JSX.Element {
  const { view, fresh, error } = useResearchData()
  if (!view || !fresh || error) return <small>Usage {error ? 'unavailable' : 'updating…'}</small>
  const count = sourceCounts(view, sourceId)
  return (
    <small>
      {count.citations} citations · {count.sections} section links · {count.evidence} evidence links
      · {count.decisions} question decisions
    </small>
  )
}
export function UsageStatus(): React.JSX.Element | null {
  const { loading, error, fresh, refresh } = useResearchData()
  return error ? (
    <p role="alert">
      {error}{' '}
      <AppButton
        variant="subtle"
        onClick={() => {
          void refresh()
        }}
      >
        Retry usage
      </AppButton>
    </p>
  ) : loading || !fresh ? (
    <p role="status">Updating saved source connections…</p>
  ) : null
}
export function SourceUsage({ sourceId }: { sourceId: string }): React.JSX.Element {
  const { view, fresh } = useResearchData()
  const { project, research, navigateSection, dirty } = useWorkspaceSession()
  if (!project) return <></>
  const source = view?.sources.find((item) => item.id === sourceId)
  const citations = [
    ...new Map(
      (view?.citations.filter((item) => item.sourceId === sourceId) ?? []).map((item) => [
        `${item.documentId}:${item.citationId}`,
        item
      ])
    ).values()
  ]
  const sections = view?.sourceSections.filter((item) => item.sourceId === sourceId) ?? []
  const links = view?.links.filter((item) => item.sourceId === sourceId) ?? []
  const decisions = view?.decisions.filter((item) => item.sourceId === sourceId) ?? []
  function sectionLink(id: string, anchorId?: string): React.JSX.Element {
    const section = view?.sections.find((item) => item.id === id)
    return (
      <>
        <AppButton
          variant="subtle"
          disabled={!section || section.state !== 'active'}
          onClick={() => {
            void navigateSection(id, anchorId)
          }}
        >
          {anchorId ? 'Open citation in ' : 'Open '}
          {sectionPath(project!.documents, id)}
        </AppButton>
        {section?.state !== 'active' ? (
          <span className="source-usage-state">{section?.state ?? 'missing'}</span>
        ) : null}
        {section?.replacementId ? (
          <AppButton
            variant="subtle"
            onClick={() => {
              void navigateSection(section.replacementId!)
            }}
          >
            Open replacement section
          </AppButton>
        ) : null}
      </>
    )
  }
  return (
    <section className="source-usage" aria-label="Where this source is used">
      <h3>Where this source is used</h3>
      <UsageStatus />
      <p>
        Saved citations, manual relationships and source decisions are shown separately.
        {dirty ? ' Current drafts may contain changes not shown here yet.' : ''}
      </p>
      {view ? (
        <>
          {source?.state !== 'active' ? (
            <p role="status">
              Source {source?.state ?? 'missing'}. Existing relationships remain visible.
              {source?.replacementId ? (
                <AppButton
                  variant="subtle"
                  onClick={() =>
                    research({ kind: 'sources', sourceId: source.replacementId!, page: 'usage' })
                  }
                >
                  View merge target separately
                </AppButton>
              ) : null}
            </p>
          ) : null}
          <h4>
            Actual manuscript citations (
            {new Set(citations.map((item) => `${item.documentId}:${item.citationId}`)).size})
          </h4>
          {citations.length ? (
            <ul>
              {citations.map((item, index) => (
                <li key={`${item.documentId}:${item.citationId}:${index}`}>
                  {sectionLink(item.documentId, item.citationId)}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              {fresh
                ? 'No saved manuscript citations for this source.'
                : 'Saved citation locations are updating.'}
            </p>
          )}
          <h4>Manual section associations ({sections.length})</h4>
          {sections.length ? (
            <ul>
              {sections.map((item) => (
                <li key={item.documentId}>
                  {sectionLink(item.documentId)}
                  <span className="source-usage-state">
                    Library association; does not insert a citation
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No section associations recorded.</p>
          )}
          <h4>
            Evidence relationships ({links.filter((item) => item.state === 'active').length} active)
          </h4>
          {links.length ? (
            <ul>
              {links.map((link) => {
                const claim = view.claims.find((item) => item.id === link.claimId),
                  excerpt = view.excerpts.find((item) => item.id === link.excerptId),
                  warnings = linkWarnings(view, link)
                return (
                  <li key={link.id}>
                    <strong>
                      {link.role.replace('_', ' ')} · {link.state}
                    </strong>
                    <p>
                      {claim?.text ??
                        (link.claimId
                          ? 'Missing claim'
                          : sectionPath(project.documents, link.documentId!))}
                    </p>
                    {excerpt ? (
                      <blockquote>{excerpt.quote}</blockquote>
                    ) : (
                      <p>
                        {link.excerptId
                          ? 'The recorded excerpt is missing.'
                          : 'Whole-source relationship.'}
                      </p>
                    )}
                    {warnings.length ? (
                      <p className="source-usage-state">Review: {warnings.join('; ')}.</p>
                    ) : null}
                    <AppButton
                      variant="subtle"
                      onClick={() =>
                        research({ kind: 'evidence', item: { kind: 'link', id: link.id } })
                      }
                    >
                      Review relationship and context
                    </AppButton>
                    {excerpt ? (
                      <AppButton
                        variant="subtle"
                        onClick={() =>
                          research({
                            kind: 'inspector',
                            sourceId: excerpt.sourceId,
                            versionId: excerpt.versionId,
                            excerptId: excerpt.id
                          })
                        }
                      >
                        Open exact excerpt
                      </AppButton>
                    ) : null}
                    {link.documentId ? (
                      sectionLink(link.documentId)
                    ) : claim ? (
                      <AppButton
                        variant="subtle"
                        onClick={() =>
                          research({ kind: 'evidence', item: { kind: 'claim', id: claim.id } })
                        }
                      >
                        Open claim
                      </AppButton>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p>No manual evidence relationships.</p>
          )}
          <h4>Question decisions ({decisions.length})</h4>
          {decisions.length ? (
            <ul>
              {decisions.map((decision) => {
                const question = view.questions.find((item) => item.id === decision.questionId)
                return (
                  <li key={decision.questionId}>
                    <strong>{decision.state}</strong> · {question?.text ?? 'Missing question'}
                    {question?.state === 'archived' ? ' · archived' : ''}
                    <p>{decision.reason}</p>
                    <AppButton
                      variant="subtle"
                      disabled={!question}
                      onClick={() =>
                        research({
                          kind: 'evidence',
                          item: { kind: 'question', id: decision.questionId },
                          sourceId
                        })
                      }
                    >
                      Open question and decision
                    </AppButton>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p>
              No question-specific decisions. Rejection for one question never removes another use.
            </p>
          )}
        </>
      ) : null}
    </section>
  )
}
