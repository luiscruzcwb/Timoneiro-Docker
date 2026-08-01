import { useCallback, useRef, useState } from 'react'
import { toast } from 'sonner'

const DEFAULT_DELAY_MS = 6000

/**
 * Optimistic delete with an Undo window: the item is marked pending
 * immediately, the real delete only fires after `delayMs` unless the
 * user clicks Undo on the toast first.
 */
export function useUndoableDelete(commit: (id: string | number) => void, delayMs = DEFAULT_DELAY_MS) {
  const [pending, setPending] = useState<Set<string | number>>(new Set())
  const timers = useRef<Map<string | number, ReturnType<typeof setTimeout>>>(new Map())

  const clearPending = (id: string | number) => {
    setPending(prev => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const remove = useCallback((id: string | number, message: string, undoLabel: string) => {
    setPending(prev => new Set(prev).add(id))

    const timer = setTimeout(() => {
      commit(id)
      timers.current.delete(id)
      clearPending(id)
    }, delayMs)
    timers.current.set(id, timer)

    toast(message, {
      duration: delayMs,
      action: {
        label: undoLabel,
        onClick: () => {
          const t = timers.current.get(id)
          if (t) clearTimeout(t)
          timers.current.delete(id)
          clearPending(id)
        },
      },
    })
  }, [commit, delayMs])

  const isPending = useCallback((id: string | number) => pending.has(id), [pending])

  return { remove, isPending }
}
