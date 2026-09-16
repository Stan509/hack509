import { useState, useRef, useCallback, useEffect } from 'react'
import { Inviter, Registerer, SessionState, UserAgent } from 'sip.js'
import { callAudio } from '../utils/callAudio.js'

const holdModifier = (description) => {
  description.sdp = description.sdp.replace(/a=sendrecv/g, 'a=sendonly')
  return Promise.resolve(description)
}

export default function useSip(sipConfig) {
  const [isRegistered, setIsRegistered] = useState(false)
  const [callStatus, setCallStatus] = useState('idle')
  const [isMuted, setIsMuted] = useState(false)
  const [isOnHold, setIsOnHold] = useState(false)
  const [activeCall, setActiveCall] = useState(null)
  const [error, setError] = useState(null)
  const userAgentRef = useRef(null)
  const registererRef = useRef(null)
  const sessionRef = useRef(null)
  const audioRef = useRef(null)

  const removeAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = null
      audioRef.current.remove()
      audioRef.current = null
    }
  }, [])

  const attachAudio = useCallback((session) => {
    const pc = session.sessionDescriptionHandler?.peerConnection
    if (!pc) return
    const stream = new MediaStream()
    pc.getReceivers().forEach(({ track }) => {
      if (track?.kind === 'audio') stream.addTrack(track)
    })
    if (!audioRef.current) {
      const audio = document.createElement('audio')
      audio.autoplay = true
      audio.style.display = 'none'
      document.body.appendChild(audio)
      audioRef.current = audio
    }
    audioRef.current.srcObject = stream
    audioRef.current.play().catch(() => setError('Le navigateur a bloqué la lecture audio. Cliquez sur APPELER pour l’autoriser.'))
  }, [])

  const trackSession = useCallback((session) => {
    sessionRef.current = session
    setActiveCall(session)
    session.stateChange.addListener((state) => {
      if (state === SessionState.Established) {
        attachAudio(session)
        setCallStatus('active')
        setError(null)
      }
      if (state === SessionState.Terminated) {
        removeAudio()
        sessionRef.current = null
        setActiveCall(null)
        setCallStatus('ended')
        setIsMuted(false)
        setIsOnHold(false)
        window.setTimeout(() => setCallStatus('idle'), 1200)
      }
    })
  }, [attachAudio, removeAudio])

  const initSipUA = useCallback(async () => {
    if (!sipConfig?.ws_url || !sipConfig?.username || !sipConfig?.password || !sipConfig?.domain) {
      setIsRegistered(false)
      return
    }
    try {
      const url = new URL(sipConfig.ws_url)
      if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('L’URL SIP doit commencer par ws:// ou wss://')
      await userAgentRef.current?.stop()
      const ua = new UserAgent({
        uri: UserAgent.makeURI(`sip:${encodeURIComponent(sipConfig.username)}@${sipConfig.domain}`),
        authorizationUsername: sipConfig.username,
        authorizationPassword: sipConfig.password,
        transportOptions: { server: sipConfig.ws_url },
        delegate: {
          onDisconnect: (reason) => {
            setIsRegistered(false)
            if (reason) setError('Connexion au PBX interrompue.')
          },
          onInvite: (invitation) => {
            trackSession(invitation)
            setCallStatus('ringing')
            setError('Appel entrant reçu. La prise d’appel entrant doit être ajoutée au poste agent.')
          },
        },
      })
      userAgentRef.current = ua
      await ua.start()
      const registerer = new Registerer(ua)
      registererRef.current = registerer
      registerer.stateChange.addListener((state) => {
        const registered = String(state) === 'Registered'
        setIsRegistered(registered)
        if (String(state) === 'Unregistered') setError('Enregistrement SIP refusé. Vérifiez URL, extension et secret.')
      })
      await registerer.register()
    } catch (err) {
      setIsRegistered(false)
      setError(`Erreur SIP : ${err.message}`)
    }
  }, [sipConfig, trackSession])

  const makeCall = useCallback(async (to) => {
    setError(null)
    setIsMuted(false)
    setIsOnHold(false)
    if (!userAgentRef.current || !isRegistered) {
      setError('PBX non enregistré. Vérifiez la configuration SIP et attendez le statut READY.')
      return null
    }
    const target = UserAgent.makeURI(`sip:${to}@${sipConfig.domain}`)
    if (!target) {
      setError('Numéro ou extension SIP invalide.')
      return null
    }
    try {
      const inviter = new Inviter(userAgentRef.current, target, { sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } })
      trackSession(inviter)
      setCallStatus('connecting')
      await inviter.invite()
      return inviter
    } catch (err) {
      setCallStatus('idle')
      setError(`Impossible de lancer l’appel SIP : ${err.message}`)
      return null
    }
  }, [isRegistered, sipConfig, trackSession])

  const hangup = useCallback(async () => {
    const session = sessionRef.current
    if (!session) return
    try {
      if (session.state === SessionState.Established) await session.bye()
      else await session.cancel()
    } catch (err) {
      setError(`Impossible de raccrocher : ${err.message}`)
    }
  }, [])

  const hold = useCallback(async () => {
    const session = sessionRef.current
    if (!session || session.state !== SessionState.Established) return
    try {
      await session.invite(isOnHold ? {} : { sessionDescriptionHandlerModifiers: [holdModifier] })
      setIsOnHold((value) => !value)
      setCallStatus((value) => (value === 'holding' ? 'active' : 'holding'))
    } catch (err) {
      setError(`Mise en attente refusée par le PBX : ${err.message}`)
    }
  }, [isOnHold])

  const mute = useCallback((forced) => {
    const value = forced ?? !isMuted
    sessionRef.current?.sessionDescriptionHandler?.peerConnection?.getSenders().forEach((sender) => {
      if (sender.track?.kind === 'audio') sender.track.enabled = !value
    })
    setIsMuted(value)
  }, [isMuted])

  const sendDigit = useCallback(async (digit) => {
    const session = sessionRef.current
    if (!session || session.state !== SessionState.Established) return
    try {
      await session.info({ requestOptions: { body: { contentDisposition: 'render', contentType: 'application/dtmf-relay', content: `Signal=${digit}\r\nDuration=160` } } })
    } catch (err) {
      setError(`DTMF non envoyé : ${err.message}`)
    }
  }, [])

  useEffect(() => {
    initSipUA()
    return () => {
      callAudio.stopDialingSound()
      removeAudio()
      registererRef.current?.unregister().catch(() => {})
      userAgentRef.current?.stop().catch(() => {})
      registererRef.current = null
      userAgentRef.current = null
    }
  }, [initSipUA, removeAudio])

  useEffect(() => {
    if (callStatus === 'connecting' || callStatus === 'ringing') callAudio.startDialingSound()
    else if (callStatus === 'active') callAudio.playConnectedSound()
    else if (callStatus === 'ended' || callStatus === 'idle') callAudio.stopDialingSound()
  }, [callStatus])

  return { isRegistered, callStatus, isMuted, isOnHold, activeCall, error, makeCall, hangup, hold, mute, sendDigit }
}
