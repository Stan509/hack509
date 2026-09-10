import { useState, useRef, useCallback, useEffect } from 'react'
import axios from 'axios'
import { callAudio } from '../utils/callAudio.js'

const API_BASE = import.meta.env.VITE_API_BASE || ''

const useTwilio = () => {
  const [isReady, setIsReady] = useState(false)
  const [callStatus, setCallStatus] = useState('idle') // 'idle'|'connecting'|'ringing'|'active'|'holding'|'ended'
  const [isMuted, setIsMuted] = useState(false)
  const [isOnHold, setIsOnHold] = useState(false)
  const [activeCall, setActiveCall] = useState(null)
  const [device, setDevice] = useState(null)
  const [simulationMode, setSimulationMode] = useState(false)
  const [error, setError] = useState(null)

  const deviceRef = useRef(null)
  const callRef = useRef(null)
  const simTimerRef = useRef(null)

  const fetchToken = useCallback(async () => {
    const token = localStorage.getItem('h509_token')
    if (!token) return null
    try {
      const res = await axios.get(`${API_BASE}/api/twilio/token/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      return res.data.token || res.data.access_token
    } catch {
      return null
    }
  }, [])

  const initDevice = useCallback(async () => {
    try {
      const { Device } = await import('@twilio/voice-sdk')
      const twilioToken = await fetchToken()

      if (!twilioToken) {
        console.warn('[Twilio] No token — entering simulation mode')
        setSimulationMode(true)
        setIsReady(true)
        return
      }

      const dev = new Device(twilioToken, {
        logLevel: 1,
        codecPreferences: ['opus', 'pcmu'],
        allowIncomingWhileBusy: false,
      })

      dev.on('ready', () => {
        setIsReady(true)
        setError(null)
        deviceRef.current = dev
        setDevice(dev)
      })

      dev.on('error', (err) => {
        setError(err.message || 'Twilio device error')
        console.error('[Twilio] Error:', err)
      })

      dev.on('incoming', (call) => {
        callRef.current = call
        setActiveCall(call)
        setCallStatus('ringing')

        call.on('accept', () => setCallStatus('active'))
        call.on('disconnect', () => {
          setCallStatus('ended')
          callRef.current = null
          setActiveCall(null)
          setTimeout(() => setCallStatus('idle'), 2000)
        })
        call.on('reject', () => {
          setCallStatus('idle')
          callRef.current = null
          setActiveCall(null)
        })
      })

      dev.on('disconnect', () => {
        setCallStatus('ended')
        callRef.current = null
        setActiveCall(null)
        setTimeout(() => setCallStatus('idle'), 2000)
      })

      dev.on('tokenWillExpire', async () => {
        const newToken = await fetchToken()
        if (newToken) dev.updateToken(newToken)
      })

      await dev.register()
      deviceRef.current = dev
      setDevice(dev)
    } catch (err) {
      console.warn('[Twilio] Init failed:', err)
      setSimulationMode(true)
      setIsReady(true)
    }
  }, [fetchToken])

  const makeCall = useCallback(async (to, params = {}) => {
    setError(null)
    setIsMuted(false)
    setIsOnHold(false)

    if (simulationMode) {
      // Simulation mode: fake call lifecycle
      setCallStatus('connecting')
      setTimeout(() => setCallStatus('ringing'), 800)
      simTimerRef.current = setTimeout(() => {
        setCallStatus('active')
      }, 2500)
      return { simulated: true }
    }

    if (!deviceRef.current) {
      setError('Twilio device not initialized')
      return null
    }

    try {
      setCallStatus('connecting')
      const call = await deviceRef.current.connect({
        params: { To: to, ...params },
      })
      callRef.current = call
      setActiveCall(call)

      call.on('ringing', () => setCallStatus('ringing'))
      call.on('accept', () => setCallStatus('active'))
      call.on('disconnect', () => {
        setCallStatus('ended')
        callRef.current = null
        setActiveCall(null)
        setTimeout(() => setCallStatus('idle'), 2000)
      })
      call.on('error', (err) => {
        setError(err.message)
        setCallStatus('ended')
        setTimeout(() => setCallStatus('idle'), 2000)
      })

      return call
    } catch (err) {
      setError(err.message || 'Failed to connect call')
      setCallStatus('idle')
      return null
    }
  }, [simulationMode])

  const hangup = useCallback(() => {
    clearTimeout(simTimerRef.current)
    if (callRef.current) {
      callRef.current.disconnect()
      callRef.current = null
    }
    setActiveCall(null)
    setCallStatus('ended')
    setIsMuted(false)
    setIsOnHold(false)
    setTimeout(() => setCallStatus('idle'), 2000)
  }, [])

  const hold = useCallback(() => {
    if (simulationMode) {
      setIsOnHold((prev) => !prev)
      setCallStatus((prev) => prev === 'active' ? 'holding' : 'active')
      return
    }
    if (callRef.current) {
      const newHold = !isOnHold
      // Twilio doesn't have built-in hold — use mute + backend API
      callRef.current.mute(newHold)
      setIsOnHold(newHold)
      setCallStatus(newHold ? 'holding' : 'active')
    }
  }, [isOnHold, simulationMode])

  const mute = useCallback((forceMuted) => {
    const newMuted = forceMuted !== undefined ? forceMuted : !isMuted
    if (simulationMode) {
      setIsMuted(newMuted)
      return
    }
    if (callRef.current) {
      callRef.current.mute(newMuted)
      setIsMuted(newMuted)
    }
  }, [isMuted, simulationMode])

  const acceptIncoming = useCallback(() => {
    if (callRef.current) {
      callRef.current.accept()
      setCallStatus('active')
    }
  }, [])

  const rejectIncoming = useCallback(() => {
    if (callRef.current) {
      callRef.current.reject()
      callRef.current = null
      setActiveCall(null)
      setCallStatus('idle')
    }
  }, [])

  const sendDigit = useCallback((digit) => {
    if (callRef.current && !simulationMode) {
      callRef.current.sendDigits(digit)
    }
  }, [simulationMode])

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
    initDevice()
    return () => {
      clearTimeout(simTimerRef.current)
      callAudio.stopDialingSound()
      if (deviceRef.current) {
        try { deviceRef.current.destroy() } catch {}
      }
    }
  }, [])

  return {
    isReady,
    callStatus,
    isMuted,
    isOnHold,
    activeCall,
    device,
    simulationMode,
    error,
    makeCall,
    hangup,
    hold,
    mute,
    acceptIncoming,
    rejectIncoming,
    sendDigit,
  }
}

export default useTwilio
