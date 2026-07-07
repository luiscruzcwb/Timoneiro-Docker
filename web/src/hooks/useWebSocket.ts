import { useEffect, useRef, useCallback } from 'react'

export interface WSEvent {
  type: string
  payload: Record<string, unknown>
  timestamp: string
}

type EventHandler = (event: WSEvent) => void

export function useWebSocket(onEvent: EventHandler) {
  const wsRef = useRef<WebSocket | null>(null)
  const handlerRef = useRef(onEvent)
  handlerRef.current = onEvent

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = `${protocol}//${window.location.host}/api/v1/ws`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onmessage = (e) => {
      try {
        const event: WSEvent = JSON.parse(e.data)
        handlerRef.current(event)
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])
}
