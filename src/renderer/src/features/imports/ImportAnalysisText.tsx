import { useState } from 'react'
import { AppButton } from '../../components/ui/Controls'
import styles from './ImportProvider.module.css'

export function ImportAnalysisText({
  text,
  label
}: {
  text: string
  label: string
}): React.JSX.Element {
  const [page, setPage] = useState(0)
  const size = 12000,
    total = Math.max(1, Math.ceil(text.length / size)),
    current = Math.min(page, total - 1)
  return (
    <div>
      <pre className={styles.original}>{text.slice(current * size, (current + 1) * size)}</pre>
      <div className={styles.actions}>
        <AppButton
          variant="subtle"
          disabled={current === 0}
          onClick={() => setPage(current - 1)}
          aria-label={`Previous page of ${label.toLowerCase()}`}
        >
          Previous
        </AppButton>
        <span>
          {label}: page {current + 1} of {total}
        </span>
        <AppButton
          variant="subtle"
          disabled={current + 1 >= total}
          onClick={() => setPage(current + 1)}
          aria-label={`Next page of ${label.toLowerCase()}`}
        >
          Next
        </AppButton>
      </div>
    </div>
  )
}
