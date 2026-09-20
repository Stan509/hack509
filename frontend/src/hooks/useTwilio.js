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
      if (res.data?.simulation || res.data?.token?.startsWith('mock_token')) {
        return null // Don't feed mock tokens to Twilio Device SDK to prevent 20101 errors
      }
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
        setSimulationMode(false)
        setIsReady(false)
        setError('Twilio is not configured or the access token is unavailable.')
        return null
      }

      // Destroy old device instance if existing
      if (deviceRef.current) {
        try { deviceRef.current.destroy() } catch {}
      }

      const dev = new Device(twilioToken, {
        logLevel: 1,
        codecPreferences: ['opus', 'pcmu'],
        allowIncomingWhileBusy: false,
      })

      dev.on('ready', () => {
        console.log('[Twilio] Device READY for live calls')
        setIsReady(true)
        setError(null)
        setSimulationMode(false)
        deviceRef.current = dev
        setDevice(dev)
      })

      dev.on('error', (err) => {
        const errMsg = err?.message || 'Twilio device error'
        console.error('[Twilio] Error:', err)
        if (err?.code === 20101 || errMsg.includes('20101') || errMsg.includes('AccessTokenInvalid')) {
          setError('AccessTokenInvalid (20101): Token invalide ou expiré. Entrez vos identifiants sur /settings.')
          setSimulationMode(true)
        } else if (err?.code === 31005 || errMsg.includes('31005')) {
          setError("Erreur passerelle (31005) : La passerelle Twilio a rejeté la connexion. Webhook TwiML injoignable ou numéro d'appelant non vérifié.")
        } else {
          setError(errMsg)
        }
      })

      dev.on('incoming', (call) => {
        callRef.current = call
        setActiveCall(call)
        setCallStatus('ringing')
        callAudio.startIncomingCallRing()

        call.on('accept', () => {
          callAudio.stopIncomingCallRing()
          setCallStatus('active')
        })
        call.on('disconnect', () => {
          callAudio.stopIncomingCallRing()
          setCallStatus('ended')
          callRef.current = null
          setActiveCall(null)
          setTimeout(() => setCallStatus('idle'), 2000)
        })
        call.on('reject', () => {
          callAudio.stopIncomingCallRing()
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
      setSimulationMode(false)
      setIsReady(true)
      setError(null)
      deviceRef.current = dev
      setDevice(dev)
      return dev
    } catch (err) {
      console.warn('[Twilio] Init failed:', err)
      setSimulationMode(true)
      setIsReady(true)
      return null
    }
  }, [fetchToken])

  const makeCall = useCallback(async (to, params = {}) => {
    setError(null)
    setIsMuted(false)
    setIsOnHold(false)

    // If currently in simulation mode or device not ready, try re-checking for real token first!
    if (simulationMode || !deviceRef.current) {
      console.log('[Twilio] Checking if real Twilio device can be initialized...')
      const liveDevice = await initDevice()
      if (!liveDevice) {
        setError('Live calling is unavailable. Check the Twilio configuration.')
        setCallStatus('idle')
        return null
      }
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
        console.error('[Twilio] Call error:', err)
        const errMsg = err?.message || ''
        if (err?.code === 31005 || errMsg.includes('31005')) {
          setError("Erreur passerelle (31005) : La passerelle Twilio a interrompu l'appel. Le Webhook vocal TwiML est injoignable ou le numéro d'appelant n'est pas autorisé sur Twilio.")
        } else {
          setError(errMsg || 'Erreur de connexion Twilio')
        }
        setCallStatus('ended')
        setTimeout(() => setCallStatus('idle'), 2000)
      })

      return call
    } catch (err) {
      setError(err.message || 'Failed to connect call')
      setCallStatus('idle')
      return null
    }
  }, [simulationMode, initDevice])

  const clearError = useCallback(() => {
    setError(null)
  }, [])

  const hangup = useCallback(() => {
    clearTimeout(simTimerRef.current)
    callAudio.stopHoldMusic()
    callAudio.stopDialingSound()
    if (callRef.current) {
      try {
        callRef.current.disconnect()
      } catch {}
      callRef.current = null
    }
    setActiveCall(null)
    setCallStatus('ended')
    setIsMuted(false)
    setIsOnHold(false)
    setError(null)
    setTimeout(() => setCallStatus('idle'), 2000)
  }, [])

  const hold = useCallback(() => {
    const newHold = !isOnHold
    setIsOnHold(newHold)
    setCallStatus(newHold ? 'holding' : 'active')
    if (newHold) {
      callAudio.startHoldMusic()
    } else {
      callAudio.stopHoldMusic()
    }
    if (callRef.current) {
      try {
        callRef.current.mute(newHold)
      } catch (e) {
        console.warn('Twilio mute/hold error:', e)
      }
    }
  }, [isOnHold])

  const mute = useCallback((forceMuted) => {
    const newMuted = forceMuted !== undefined ? forceMuted : !isMuted
    setIsMuted(newMuted)
    if (callRef.current) {
      try {
        callRef.current.mute(newMuted)
      } catch (e) {
        console.warn('Twilio mute error:', e)
      }
    }
  }, [isMuted])

  const acceptIncoming = useCallback(() => {
    callAudio.stopIncomingCallRing()
    if (callRef.current) {
      callRef.current.accept()
      setCallStatus('active')
    }
  }, [])

  const rejectIncoming = useCallback(() => {
    callAudio.stopIncomingCallRing()
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
    if (callStatus === 'connecting' || callStatus === 'ringing' || callStatus === 'dialing') {
      callAudio.stopHoldMusic()
      callAudio.startDialingSound()
    } else if (callStatus === 'active') {
      callAudio.stopHoldMusic()
      callAudio.playConnectedSound()
    } else if (callStatus === 'holding') {
      callAudio.startHoldMusic()
    } else if (callStatus === 'ended') {
      callAudio.stopHoldMusic()
      callAudio.playEndedSound()
    } else if (callStatus === 'idle') {
      callAudio.stopHoldMusic()
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
    clearError,
    initDevice,
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
