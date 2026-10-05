import { useCallback, useRef, useState, type RefObject } from 'react'

/** Display operation state while keeping event/async guards current before React commits. */
export function useSynchronousState<T>(initial: T): [T, (value: T) => void, RefObject<T>] {
  const [value, setValue] = useState(initial)
  const valueRef = useRef(initial)
  const update = useCallback((next: T): void => {
    valueRef.current = next
    setValue(() => next)
  }, [])
  return [value, update, valueRef]
}
