import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'
import useTwilio from './useTwilio.js'
import useSip from './useSip.js'

const API_BASE = import.meta.env.VITE_API_BASE || ''

export default function useTelephony() {
  const [providerType, setProviderType] = useState('twilio') // 'twilio' | 'asterisk'
  const [sipConfig, setSipConfig] = useState(null)
  const [loadingConfig, setLoadingConfig] = useState(true)

  const twilioEngine = useTwilio()
  const sipEngine = useSip(sipConfig)

  const checkProviderConfig = useCallback(async () => {
    const token = localStorage.getItem('h509_token')
    if (!token) return
    try {
      setLoadingConfig(true)
      const res = await axios.get(`${API_BASE}/api/twilio/token/`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = res.data || {}
      if (data.provider === 'asterisk') {
        setProviderType('asterisk')
        setSipConfig({
          ws_url: data.ws_url,
          username: data.username,
          password: data.password,
          domain: data.domain,
          outbound_proxy: data.outbound_proxy,
        })
      } else {
        setProviderType('twilio')
        setSipConfig(null)
      }
    } catch (e) {
      console.warn('[Telephony] Could not fetch provider config:', e)
    } finally {
      setLoadingConfig(false)
    }
  }, [])

  useEffect(() => {
    checkProviderConfig()
  }, [checkProviderConfig])

  const activeEngine = providerType === 'asterisk' ? sipEngine : twilioEngine

  return {
    providerType,
    loadingConfig,
    isReady: providerType === 'asterisk' ? sipEngine.isRegistered : twilioEngine.isReady,
    callStatus: activeEngine.callStatus,
    isMuted: activeEngine.isMuted,
    isOnHold: activeEngine.isOnHold,
    activeCall: activeEngine.activeCall,
    simulationMode: providerType === 'twilio' ? twilioEngine.simulationMode : false,
    error: activeEngine.error,
    makeCall: activeEngine.makeCall,
    hangup: activeEngine.hangup,
    hold: activeEngine.hold,
    mute: activeEngine.mute,
    sendDigit: activeEngine.sendDigit,
    refreshProviderConfig: checkProviderConfig,
  }
}
