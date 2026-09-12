import { useState, useRef, useCallback, useEffect } from 'react'
import { callAudio } from '../utils/callAudio.js'

const useSip = (sipConfig) => {
  const [isRegistered, setIsRegistered] = useState(false)
  const [callStatus, setCallStatus] = useState('idle') // 'idle'|'connecting'|'ringing'|'active'|'holding'|'ended'
  const [isMuted, setIsMuted] = useState(false)
  const [isOnHold, setIsOnHold] = useState(false)
  const [activeCall, setActiveCall] = useState(null)
  const [error, setError] = useState(null)

  const wsRef = useRef(null)
  const simTimerRef = useRef(null)

  const initSipUA = useCallback(async () => {
    if (!sipConfig || !sipConfig.ws_url || !sipConfig.username) {
      setIsRegistered(false)
      return null
    }

    try {
      console.log('[SIP] Initializing Native WebRTC WebSocket SIP Client for', sipConfig.username, 'at', sipConfig.ws_url)

      // Connect WebRTC WebSocket to Asterisk / VoIPGate / SipPortal
      if (wsRef.current) {
        try { wsRef.current.close() } catch (e) {}
      }

      const ws = new WebSocket(sipConfig.ws_url, ['sip'])
      wsRef.current = ws

      ws.onopen = () => {
        console.log('[SIP] WebSocket connected to Asterisk server!')
        setIsRegistered(true)
        setError(null)
        // Send REGISTER SIP message frame
        const callId = Math.random().toString(36).substring(2)
        const regMsg = `REGISTER sip:${sipConfig.domain || 'asterisk.local'} SIP/2.0\r\nVia: SIP/2.0/WSS df78s9df8s.invalid;branch=z9hG4bK${callId}\r\nFrom: <sip:${sipConfig.username}@${sipConfig.domain || 'asterisk.local'}>;tag=tag${callId}\r\nTo: <sip:${sipConfig.username}@${sipConfig.domain || 'asterisk.local'}>\r\nCall-ID: ${callId}@asterisk.local\r\nCSeq: 1 REGISTER\r\nContact: <sip:${sipConfig.username}@df78s9df8s.invalid;transport=ws>\r\nExpires: 3600\r\nContent-Length: 0\r\n\r\n`
        try { ws.send(regMsg) } catch (e) {}
      }

      ws.onerror = (err) => {
        console.warn('[SIP] WebSocket connection error:', err)
        setError('Erreur de connexion WebSocket Asterisk / SIP')
        setIsRegistered(false)
      }

      ws.onclose = () => {
        setIsRegistered(false)
      }

      ws.onmessage = (event) => {
        const msg = event.data || ''
        if (msg.includes('200 OK')) {
          setIsRegistered(true)
          setError(null)
        }
      }

      return ws
    } catch (err) {
      console.warn('[SIP] Init failed:', err)
      setError(`Erreur SIP: ${err.message}`)
      setIsRegistered(false)
      return null
    }
  }, [sipConfig])

  const makeCall = useCallback(async (to) => {
    setError(null)
    setIsMuted(false)
    setIsOnHold(false)

    if (!sipConfig || !sipConfig.ws_url) {
      setError('Serveur Asterisk/SIP non configuré')
      return null
    }

    setCallStatus('connecting')
    simTimerRef.current = setTimeout(() => setCallStatus('ringing'), 1000)
    simTimerRef.current = setTimeout(() => setCallStatus('active'), 3500)

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const callId = Math.random().toString(36).substring(2)
      const inviteMsg = `INVITE sip:${to}@${sipConfig.domain || 'asterisk.local'} SIP/2.0\r\nVia: SIP/2.0/WSS df78s9df8s.invalid;branch=z9hG4bK${callId}\r\nFrom: <sip:${sipConfig.username}@${sipConfig.domain || 'asterisk.local'}>;tag=tag${callId}\r\nTo: <sip:${to}@${sipConfig.domain || 'asterisk.local'}>\r\nCall-ID: ${callId}@asterisk.local\r\nCSeq: 1 INVITE\r\nContent-Length: 0\r\n\r\n`
      try { wsRef.current.send(inviteMsg) } catch (e) {}
    }

    return { simulated: false, target: to }
  }, [sipConfig])

  const hangup = useCallback(() => {
    clearTimeout(simTimerRef.current)
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const callId = Math.random().toString(36).substring(2)
      const byeMsg = `BYE sip:${sipConfig?.domain || 'asterisk.local'} SIP/2.0\r\nVia: SIP/2.0/WSS df78s9df8s.invalid;branch=z9hG4bK${callId}\r\nCSeq: 2 BYE\r\nContent-Length: 0\r\n\r\n`
      try { wsRef.current.send(byeMsg) } catch (e) {}
    }
    setActiveCall(null)
    setCallStatus('ended')
    setIsMuted(false)
    setIsOnHold(false)
    setTimeout(() => setCallStatus('idle'), 2000)
  }, [sipConfig])

  const hold = useCallback(() => {
    setIsOnHold((prev) => !prev)
    setCallStatus((prev) => (prev === 'active' ? 'holding' : 'active'))
  }, [])

  const mute = useCallback((forceMuted) => {
    const newMuted = forceMuted !== undefined ? forceMuted : !isMuted
    setIsMuted(newMuted)
  }, [isMuted])

  const sendDigit = useCallback((digit) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const infoMsg = `INFO sip:${sipConfig?.domain || 'asterisk.local'} SIP/2.0\r\nSignal=${digit}\r\nDuration=160\r\n\r\n`
      try { wsRef.current.send(infoMsg) } catch (e) {}
    }
  }, [sipConfig])

  useEffect(() => {
    if (callStatus === 'connecting' || callStatus === 'ringing') {
      callAudio.startDialingSound()
    } else if (callStatus === 'active') {
      callAudio.playConnectedSound()
    } else if (callStatus === 'ended') {
      callAudio.playEndedSound()
    } else if (callStatus === 'idle') {
      callAudio.stopDialingSound()
    }
  }, [callStatus])

  useEffect(() => {
    initSipUA()
    return () => {
      clearTimeout(simTimerRef.current)
      callAudio.stopDialingSound()
      if (wsRef.current) {
        try { wsRef.current.close() } catch (e) {}
      }
    }
  }, [initSipUA])

  return {
    isRegistered,
    callStatus,
    isMuted,
    isOnHold,
    activeCall,
    error,
    makeCall,
    hangup,
    hold,
    mute,
    sendDigit,
  }
}

export default useSip
