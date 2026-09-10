import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from './AuthContext.jsx'

const DialerContext = createContext(null)

const getWsUrl = () => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/dialer/`
}

export function DialerProvider({ children }) {
  const { api, isAuthenticated, token } = useAuth()
  const wsRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)
  const reconnectAttemptsRef = useRef(0)
  const MAX_RECONNECT_ATTEMPTS = 10

  const [wsStatus, setWsStatus] = useState('disconnected') // 'connecting' | 'connected' | 'disconnected'
  const [queue, setQueue] = useState([])
  const [currentContact, setCurrentContact] = useState(null)
  const [callStatus, setCallStatus] = useState('idle') // 'idle' | 'dialing' | 'active' | 'ended' | 'holding'
  const [queuePaused, setQueuePaused] = useState(false)
  const [autoDial, setAutoDial] = useState(true)
  const [lastEvent, setLastEvent] = useState(null)
  const [callTimer, setCallTimer] = useState(0)
  const callTimerRef = useRef(null)

  const [ringTimeout, setRingTimeout] = useState(12) // default 12s timeout for unassigned/no-answer
  const [ringTimer, setRingTimer] = useState(12)
  const [ringTimeoutActive, setRingTimeoutActive] = useState(false)
  const ringTimerRef = useRef(null)

  // Timer for active calls
  useEffect(() => {
    if (callStatus === 'active') {
      callTimerRef.current = setInterval(() => {
        setCallTimer((t) => t + 1)
      }, 1000)
    } else {
      clearInterval(callTimerRef.current)
      if (callStatus === 'idle' || callStatus === 'ended') setCallTimer(0)
    }
    return () => clearInterval(callTimerRef.current)
  }, [callStatus])

  const connect = useCallback(() => {
    if (!isAuthenticated) return
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    setWsStatus('connecting')
    const baseUrl = getWsUrl()
    // token may be null when WS doesn't require auth header in URL
    const storedToken = token || localStorage.getItem('h509_token')
    const url = storedToken ? `${baseUrl}?token=${storedToken}` : baseUrl

    try {
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => {
        setWsStatus('connected')
        reconnectAttemptsRef.current = 0
        sendCommand('sync', {})
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          handleMessage(data)
        } catch (err) {
          console.warn('[DialerWS] Invalid JSON:', err)
        }
      }

      ws.onclose = (e) => {
        setWsStatus('disconnected')
        if (e.code !== 1000 && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
          reconnectAttemptsRef.current += 1
          reconnectTimeoutRef.current = setTimeout(connect, delay)
        }
      }

      ws.onerror = () => {
        setWsStatus('disconnected')
      }
    } catch (err) {
      setWsStatus('disconnected')
      console.warn('[DialerWS] Connection failed:', err)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, token])

  const handleMessage = useCallback((data) => {
    setLastEvent(data)

    switch (data.type) {
      case 'queue_update':
        setQueue(data.payload?.contacts || data.payload || [])
        break
      case 'queue_state':
        setQueue(data.payload?.contacts || [])
        setQueuePaused(data.payload?.paused ?? false)
        break
      case 'call_started':
        setCurrentContact(data.payload?.contact || data.payload)
        setCallStatus('dialing')
        break
      case 'call_answered':
        setCallStatus('active')
        break
      case 'call_ended':
        setCallStatus('ended')
        setTimeout(() => setCallStatus('idle'), 2000)
        break
      case 'call_failed':
        setCallStatus('ended')
        setTimeout(() => setCallStatus('idle'), 2000)
        break
      case 'queue_paused':
        setQueuePaused(true)
        break
      case 'queue_resumed':
        setQueuePaused(false)
        break
      case 'contact_added':
        setQueue((prev) => [...prev, data.payload])
        break
      case 'contact_removed':
        setQueue((prev) => prev.filter((c) => c.id !== data.payload?.id))
        break
      case 'sync_response':
        if (data.payload?.queue) setQueue(data.payload.queue)
        if (data.payload?.paused !== undefined) setQueuePaused(data.payload.paused)
        if (data.payload?.callStatus) setCallStatus(data.payload.callStatus)
        if (data.payload?.currentContact) setCurrentContact(data.payload.currentContact)
        break
      default:
        break
    }
  }, [])

  const sendCommand = useCallback((type, payload = {}) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }))
      return true
    }
    return false
  }, [])

  const dialNext = useCallback(() => {
    if (queuePaused) return null
    let nextContact = null
    setQueue((prevQueue) => {
      if (!prevQueue || prevQueue.length === 0) return prevQueue
      const [next, ...remaining] = prevQueue
      nextContact = next
      setCurrentContact(next)
      setCallStatus('dialing')
      sendCommand('dial_next', { contact_id: next.id })
      return remaining
    })
    return nextContact
  }, [queuePaused, sendCommand])

  const pauseQueue = useCallback(() => {
    setQueuePaused(true)
    sendCommand('pause_queue', {})
  }, [sendCommand])

  const resumeQueue = useCallback(() => {
    setQueuePaused(false)
    sendCommand('resume_queue', {})
  }, [sendCommand])

  const hangUp = useCallback(() => {
    setCallStatus('ended')
    sendCommand('hangup', { contact_id: currentContact?.id })

    setQueue((prevQueue) => {
      if (autoDial && !queuePaused && prevQueue && prevQueue.length > 0) {
        const [next, ...remaining] = prevQueue
        setTimeout(() => {
          setCurrentContact(next)
          setCallStatus('dialing')
          sendCommand('dial_next', { contact_id: next.id })
        }, 1500)
        return remaining
      } else {
        setTimeout(() => {
          setCallStatus('idle')
        }, 2000)
        return prevQueue
      }
    })
  }, [currentContact, autoDial, queuePaused, sendCommand])

  const toggleFavoriteContact = useCallback(async (contact) => {
    if (!contact || !contact.id) return
    const newFav = !contact.is_favorite
    setQueue((prev) => prev.map((c) => (c.id === contact.id ? { ...c, is_favorite: newFav } : c)))
    if (currentContact?.id === contact.id) {
      setCurrentContact((prev) => (prev ? { ...prev, is_favorite: newFav } : prev))
    }
    try {
      if (api && typeof contact.id === 'number') {
        await api.patch(`/api/contacts/${contact.id}/`, { is_favorite: newFav })
      }
    } catch (err) {
      console.warn('Failed to update favorite status:', err)
    }
  }, [api, currentContact])

  const addToQueue = useCallback((contact) => {
    setQueue((prev) => [...prev, contact])
    sendCommand('add_to_queue', { contact })
  }, [sendCommand])

  const addBulkToQueue = useCallback((contactsList) => {
    if (!Array.isArray(contactsList) || contactsList.length === 0) return
    setQueue((prev) => [...prev, ...contactsList])
    sendCommand('add_bulk_to_queue', { contacts: contactsList })
  }, [sendCommand])

  const removeFromQueue = useCallback((contactId) => {
    setQueue((prev) => prev.filter((c) => c.id !== contactId))
    sendCommand('remove_from_queue', { contact_id: contactId })
  }, [sendCommand])

  const logCallOutcome = useCallback(async (outcome, notes) => {
    sendCommand('log_outcome', {
      contact_id: currentContact?.id,
      outcome,
      notes,
    })
    if (api && currentContact?.id && typeof currentContact.id === 'number') {
      try {
        await api.patch(`/api/contacts/${currentContact.id}/`, { status: outcome, notes })
      } catch (err) {
        console.warn('Failed to update status in DB:', err)
      }
    }
  }, [api, currentContact, sendCommand])

  const handleRingTimeout = useCallback(async () => {
    if (currentContact) {
      logCallOutcome('no_answer', 'Timeout : Numéro non attribué / Pas de réponse')
    }
    hangUp()
  }, [currentContact, logCallOutcome, hangUp])

  useEffect(() => {
    if (callStatus === 'dialing' || callStatus === 'connecting' || callStatus === 'ringing') {
      setRingTimer(ringTimeout)
      setRingTimeoutActive(true)
      ringTimerRef.current = setInterval(() => {
        setRingTimer((prev) => {
          if (prev <= 1) {
            clearInterval(ringTimerRef.current)
            setRingTimeoutActive(false)
            handleRingTimeout()
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } else {
      clearInterval(ringTimerRef.current)
      setRingTimeoutActive(false)
      setRingTimer(ringTimeout)
    }
    return () => clearInterval(ringTimerRef.current)
  }, [callStatus, ringTimeout, handleRingTimeout])

  // Connect when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      connect()
    } else {
      wsRef.current?.close(1000)
      setWsStatus('disconnected')
    }
    return () => {
      clearTimeout(reconnectTimeoutRef.current)
      wsRef.current?.close(1000)
    }
  }, [isAuthenticated])

  const formatTimer = (seconds) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0')
    const s = (seconds % 60).toString().padStart(2, '0')
    return `${m}:${s}`
  }

  return (
    <DialerContext.Provider value={{
      wsStatus,
      queue,
      setQueue,
      currentContact,
      setCurrentContact,
      callStatus,
      setCallStatus,
      queuePaused,
      autoDial,
      setAutoDial,
      lastEvent,
      callTimer,
      formatTimer,
      ringTimeout,
      setRingTimeout,
      ringTimer,
      ringTimeoutActive,
      dialNext,
      pauseQueue,
      resumeQueue,
      hangUp,
      addToQueue,
      addBulkToQueue,
      removeFromQueue,
      toggleFavoriteContact,
      logCallOutcome,
      sendCommand,
      connect,
    }}>
      {children}
    </DialerContext.Provider>
  )
}

export function useDialer() {
  const ctx = useContext(DialerContext)
  if (!ctx) throw new Error('useDialer must be used within DialerProvider')
  return ctx
}
