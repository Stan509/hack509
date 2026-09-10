import { useState, useRef, useCallback, useEffect } from 'react'

const getWsUrl = () => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/dialer/`
}

const useDialerWS = () => {
  const [wsStatus, setWsStatus] = useState('disconnected')
  const [queueState, setQueueState] = useState({ contacts: [], paused: false })
  const [lastEvent, setLastEvent] = useState(null)

  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const attemptsRef = useRef(0)
  const MAX_ATTEMPTS = 10

  const sendCommand = useCallback((type, payload = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }))
      return true
    }
    return false
  }, [])

  const handleMessage = useCallback((raw) => {
    try {
      const data = JSON.parse(raw)
      setLastEvent(data)

      switch (data.type) {
        case 'queue_state':
        case 'sync_response':
          setQueueState({
            contacts: data.payload?.contacts || data.payload?.queue || [],
            paused: data.payload?.paused ?? false,
          })
          break
        case 'queue_update':
          setQueueState((prev) => ({
            ...prev,
            contacts: data.payload?.contacts || data.payload || [],
          }))
          break
        case 'queue_paused':
          setQueueState((prev) => ({ ...prev, paused: true }))
          break
        case 'queue_resumed':
          setQueueState((prev) => ({ ...prev, paused: false }))
          break
        case 'contact_added':
          setQueueState((prev) => ({
            ...prev,
            contacts: [...prev.contacts, data.payload],
          }))
          break
        case 'contact_removed':
          setQueueState((prev) => ({
            ...prev,
            contacts: prev.contacts.filter((c) => c.id !== data.payload?.id),
          }))
          break
        default:
          break
      }
    } catch (err) {
      console.warn('[useDialerWS] Parse error:', err)
    }
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    clearTimeout(reconnectTimeoutRef.current)
    setWsStatus('connecting')

    const baseUrl = getWsUrl()
    const url = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('connected')
        attemptsRef.current = 0
        sendCommand('sync', {})
      }

      ws.onmessage = (e) => handleMessage(e.data)

      ws.onclose = (e) => {
        setWsStatus('disconnected')
        if (e.code !== 1000 && attemptsRef.current < MAX_ATTEMPTS) {
          const delay = Math.min(1000 * 2 ** attemptsRef.current, 30000)
          attemptsRef.current += 1
          reconnectTimeoutRef.current = setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        setWsStatus('disconnected')
        ws.close()
      }
    } catch {
      setWsStatus('disconnected')
    }
  }, [handleMessage, sendCommand])

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimeoutRef.current)
    attemptsRef.current = MAX_ATTEMPTS // Prevent reconnect
    wsRef.current?.close(1000)
    setWsStatus('disconnected')
  }, [])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimeoutRef.current)
      wsRef.current?.close(1000)
    }
  }, [])

  return {
    wsStatus,
    queueState,
    lastEvent,
    sendCommand,
    connect,
    disconnect,
  }
}

export default useDialerWS
