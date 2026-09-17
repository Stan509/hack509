import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import RFB from '@novnc/novnc'
import { api } from '../contexts/AuthContext.jsx'
import CapturePreviewModal from './CapturePreviewModal.jsx'

export default function EmbeddedBrowserModal({
  isOpen,
  onClose,
  initialTarget = 'tps', // 'tps' | 'fps'
  initialPhone = '',
  contactName = '',
  onImportSuccess
}) {
  const [sessionTicket, setSessionTicket] = useState('')
  const [targetSite, setTargetSite] = useState(initialTarget) // 'tps' | 'fps'
  const [proxyActive, setProxyActive] = useState(false)
  const [proxyProvider, setProxyProvider] = useState('Connexion directe')
  const [copiedStatus, setCopiedStatus] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('Initialisation du navigateur…')
  const [rfbConnected, setRfbConnected] = useState(false)
  const [navigating, setNavigating] = useState(false)
  const [activeUrl, setActiveUrl] = useState('')

  // Capture workflow state
  const [capturing, setCapturing] = useState(false)
  const [capturedLeads, setCapturedLeads] = useState([])
  const [previewOpen, setPreviewOpen] = useState(false)

  const canvasContainerRef = useRef(null)
  const rfbRef = useRef(null)
  const connectingRef = useRef(false)
  const sessionTicketRef = useRef('')
  const reconnectAttemptsRef = useRef(0)
  const connectTimeoutRef = useRef(null)
  const isOpenRef = useRef(isOpen)
  isOpenRef.current = isOpen
  const rfbConnectedRef = useRef(rfbConnected)
  rfbConnectedRef.current = rfbConnected

  // Disconnect & cleanup RFB instance
  const cleanupRfb = useCallback(() => {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current)
      connectTimeoutRef.current = null
    }
    if (rfbRef.current) {
      try {
        rfbRef.current.disconnect()
      } catch (e) {
        console.warn('Error disconnecting RFB:', e)
      }
      rfbRef.current = null
    }
    connectingRef.current = false
    setRfbConnected(false)
  }, [])

  // Heartbeat to keep session lock active only after connection is established
  useEffect(() => {
    if (!isOpen || !sessionTicket || !rfbConnected) return
    const interval = setInterval(async () => {
      try {
        await api.post('/api/browser/session/heartbeat/', { ticket: sessionTicket })
      } catch (err) {
        console.warn('Heartbeat error:', err)
      }
    }, 20000)
    return () => clearInterval(interval)
  }, [isOpen, sessionTicket, rfbConnected])

  // Establish direct RFB connection to Chromium via Websockify
  const connectRfb = useCallback((ticket) => {
    if (!canvasContainerRef.current) return
    if (connectingRef.current || rfbRef.current) {
      return
    }

    connectingRef.current = true
    setConnectionStatus('Connexion à Chromium…')
    setErrorMessage('')

    if (canvasContainerRef.current) {
      canvasContainerRef.current.innerHTML = ''
    }

    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socketUrl = `${scheme}://${window.location.host}/websockify?ticket=${encodeURIComponent(ticket)}`

    try {
      const rfb = new RFB(canvasContainerRef.current, socketUrl, {
        wsProtocols: ['binary']
      })

      // Viewport configuration
      rfb.scaleViewport = true
      rfb.resizeSession = true
      rfb.clipViewport = false
      rfb.viewOnly = false
      rfb.focusOnClick = true
      rfb.showDotCursor = true

      rfbRef.current = rfb

      // Timeout if connection takes longer than 15s
      connectTimeoutRef.current = setTimeout(() => {
        if (!rfbConnectedRef.current && rfbRef.current === rfb) {
          setConnectionStatus('Service websockify indisponible')
          setErrorMessage('Délai de connexion dépassé. Le service distant met trop de temps à répondre.')
          cleanupRfb()
        }
      }, 15000)

      rfb.addEventListener('connect', () => {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current)
          connectTimeoutRef.current = null
        }
        connectingRef.current = false
        reconnectAttemptsRef.current = 0
        setRfbConnected(true)
        setConnectionStatus('Navigateur connecté')
        setErrorMessage('')

        // Auto sync clipboard with target phone number
        if (initialPhone) {
          try {
            rfb.clipboardPasteFrom(initialPhone)
          } catch (e) {
            console.debug('Clipboard sync notice:', e)
          }
        }
      })

      rfb.addEventListener('disconnect', (event) => {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current)
          connectTimeoutRef.current = null
        }
        connectingRef.current = false
        setRfbConnected(false)
        rfbRef.current = null

        console.error('RFB disconnected', {
          clean: event?.detail?.clean
        })

        if (event?.detail?.clean) {
          setConnectionStatus('Session fermée')
        } else {
          // Reconnect logic with max 3 attempts
          if (reconnectAttemptsRef.current < 3 && isOpenRef.current) {
            reconnectAttemptsRef.current += 1
            setConnectionStatus(`Reconnexion… (${reconnectAttemptsRef.current}/3)`)
            setTimeout(() => {
              if (isOpenRef.current && sessionTicketRef.current) {
                connectRfb(sessionTicketRef.current)
              }
            }, 2000)
          } else {
            setConnectionStatus('Connexion RFB interrompue')
            setErrorMessage('La connexion WebSocket au navigateur distant a été interrompue.')
          }
        }
      })

      rfb.addEventListener('securityfailure', () => {
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current)
          connectTimeoutRef.current = null
        }
        connectingRef.current = false
        setRfbConnected(false)
        rfbRef.current = null
        console.error('RFB security failure')
        setConnectionStatus('Authentification Hack509 refusée')
        setErrorMessage('Authentification Hack509 refusée ou ticket navigateur expiré.')
      })

      rfb.addEventListener('credentialsrequired', () => {
        connectingRef.current = false
        setRfbConnected(false)
        setConnectionStatus('Identifiants VNC requis')
        setErrorMessage('Identifiants VNC requis par le serveur distant.')
      })

    } catch (err) {
      connectingRef.current = false
      rfbRef.current = null
      console.error('RFB init error:', err)
      setConnectionStatus('Service websockify indisponible')
      setErrorMessage(err.message || 'Impossible d’initialiser le client RFB.')
    }
  }, [cleanupRfb, initialPhone])

  // Initialize browser session on backend and launch RFB
  const initBrowserSession = useCallback(async (target, forceNew = false) => {
    setConnectionStatus('Initialisation du navigateur…')
    setErrorMessage('')
    setRfbConnected(false)
    reconnectAttemptsRef.current = 0

    // Clean up any stale RFB instance before starting
    cleanupRfb()

    try {
      const resp = await api.post('/api/browser/session/', {
        target,
        force_new_ticket: forceNew
      })
      if (resp.data && resp.data.success) {
        const ticket = resp.data.ticket || ''
        sessionTicketRef.current = ticket
        setSessionTicket(ticket)
        setProxyActive(Boolean(resp.data.proxy_active))
        setProxyProvider(resp.data.proxy_provider || 'Connexion directe')
        setActiveUrl(resp.data.target_url || '')

        // Connect RFB
        connectRfb(ticket)
      } else {
        setConnectionStatus('Navigateur indisponible')
        setErrorMessage(resp.data?.error || 'Serveur du navigateur indisponible.')
      }
    } catch (err) {
      console.warn('Browser session init error:', err)
      if (err.response?.status === 423 || err.response?.data?.locked) {
        setConnectionStatus('Connexion refusée')
        setErrorMessage(err.response?.data?.error || 'Le navigateur est actuellement utilisé par un autre opérateur.')
      } else {
        setConnectionStatus('Navigateur indisponible')
        setErrorMessage(err.response?.data?.error || 'Serveur du navigateur indisponible.')
      }
    }
  }, [cleanupRfb, connectRfb])

  useEffect(() => {
    if (isOpen) {
      setTargetSite(initialTarget)
      setErrorMessage('')
      initBrowserSession(initialTarget, false)
      if (initialPhone) {
        copyNumberToClipboard(initialPhone, initialTarget)
      }
    } else {
      cleanupRfb()
      sessionTicketRef.current = ''
      setSessionTicket('')
      setPreviewOpen(false)
      setRfbConnected(false)
    }
    return () => {
      cleanupRfb()
    }
  }, [isOpen])

  const handleClose = async () => {
    cleanupRfb()
    try {
      await api.delete('/api/browser/session/')
    } catch (err) {
      console.warn('Close session error:', err)
    }
    sessionTicketRef.current = ''
    setSessionTicket('')
    setPreviewOpen(false)
    setRfbConnected(false)
    onClose()
  }

  const copyNumberToClipboard = async (phoneNum, target) => {
    if (!phoneNum) return
    const siteLabel = target === 'fps' ? 'FPS' : 'TPS'
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(phoneNum)
        setCopiedStatus(`Numéro copié — collez-le dans la recherche ${siteLabel}`)
      } else {
        fallbackCopy(phoneNum, siteLabel)
      }
      // Also send to remote RFB clipboard
      if (rfbRef.current) {
        try {
          rfbRef.current.clipboardPasteFrom(phoneNum)
        } catch (e) {
          console.debug('Remote clipboard paste:', e)
        }
      }
    } catch {
      fallbackCopy(phoneNum, siteLabel)
    }
    setTimeout(() => setCopiedStatus(''), 6000)
  }

  const fallbackCopy = (text, siteLabel) => {
    try {
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      setCopiedStatus(`Numéro copié — collez-le dans la recherche ${siteLabel}`)
    } catch {
      setCopiedStatus('Presse-papiers indisponible — utilisez le bouton Copier ci-dessus')
    }
  }

  const handleBrowserAction = async (action) => {
    setNavigating(true)
    try {
      await api.post('/api/browser/action/', { action })
    } catch (err) {
      console.error('Browser action error:', err)
    } finally {
      setNavigating(false)
    }
  }

  const handleSwitchSite = async (newSite) => {
    setTargetSite(newSite)
    try {
      await api.post('/api/browser/session/', { target: newSite })
      if (initialPhone) {
        copyNumberToClipboard(initialPhone, newSite)
      }
    } catch (err) {
      console.error('Switch site error:', err)
    }
  }

  const handleCapturePage = async () => {
    setCapturing(true)
    setErrorMessage('')
    try {
      const resp = await api.post('/api/browser/capture/')
      if (resp.data && resp.data.success) {
        const leads = resp.data.results || []
        setCapturedLeads(leads)
        setActiveUrl(resp.data.current_url || '')
        setPreviewOpen(true)
      } else {
        alert(resp.data?.error || 'Aucune donnée reconnue sur cette page.')
      }
    } catch (err) {
      console.error('Capture error:', err)
      alert('Erreur lors de la capture : ' + (err.response?.data?.error || err.message))
    } finally {
      setCapturing(false)
    }
  }

  if (!isOpen) return null

  const isTPS = targetSite === 'tps'
  const siteTitle = isTPS ? 'TruePeopleSearch (TPS)' : 'FastPeopleSearch (FPS)'
  const siteAccent = isTPS ? '#00d4ff' : '#ff9900'

  return (
    <>
      <AnimatePresence>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3"
          style={{ background: 'rgba(0, 0, 0, 0.88)', backdropFilter: 'blur(6px)' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            className="card-cyber w-full max-w-6xl h-[90vh] flex flex-col rounded overflow-hidden shadow-2xl"
            style={{
              border: `1px solid ${siteAccent}66`,
              boxShadow: `0 0 50px ${siteAccent}22`,
            }}
          >
            {/* Top Bar: Controls, Status & Close */}
            <div className="bg-black/95 px-4 py-2.5 border-b border-white/10 flex items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleClose}
                    className="w-3.5 h-3.5 rounded-full bg-red-500 hover:brightness-125 transition-all cursor-pointer"
                    title="Fermer le navigateur"
                  />
                  <div className="w-3.5 h-3.5 rounded-full bg-yellow-500 opacity-60" />
                  <div className="w-3.5 h-3.5 rounded-full bg-green-500 opacity-60" />
                </div>
                <div className="h-4 w-px bg-white/20" />
                <div className="terminal-header flex items-center gap-2 text-xs font-bold">
                  <span style={{ color: siteAccent }}>NAVIGATEUR EMBARQUÉ HACK509</span>
                  <span className="text-text-muted">[{siteTitle}]</span>
                </div>
              </div>

              {/* Status and Proxy indicators */}
              <div className="flex items-center gap-2">
                {/* Connection Status Badge */}
                <div
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm border text-[0.65rem] font-mono"
                  style={{
                    borderColor: rfbConnected ? '#00ff66' : '#ff9900',
                    color: rfbConnected ? '#00ff66' : '#ff9900',
                    background: rfbConnected ? 'rgba(0,255,102,0.1)' : 'rgba(255,153,0,0.1)',
                  }}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${rfbConnected ? 'bg-neon-green' : 'bg-neon-warn animate-ping'}`}
                  />
                  <span>{connectionStatus}</span>
                </div>

                {/* Proxy State Badge */}
                <div
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm border text-[0.65rem] font-mono"
                  style={{
                    borderColor: proxyActive ? '#ff9900' : '#00ff66',
                    color: proxyActive ? '#ff9900' : '#00ff66',
                    background: proxyActive ? 'rgba(255,153,0,0.1)' : 'rgba(0,255,102,0.1)',
                  }}
                  title={proxyActive ? 'Navigation routée via le proxy Decodo' : 'Navigation utilisant l’adresse IP naturelle du serveur'}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: proxyActive ? '#ff9900' : '#00ff66' }} />
                  <span>{proxyActive ? 'CONNEXION VIA DECODO' : 'CONNEXION DIRECTE (IP SERVEUR)'}</span>
                </div>

                <button
                  onClick={handleClose}
                  className="text-text-muted hover:text-neon-danger text-xs font-mono px-2 py-0.5 transition-colors cursor-pointer"
                >
                  ✕ FERMER
                </button>
              </div>
            </div>

            {/* Navigation & Action Ribbon */}
            <div className="bg-black/85 px-4 py-2 border-b border-white/10 flex flex-wrap items-center justify-between gap-2.5 flex-shrink-0">
              {/* Site selector tabs */}
              <div className="flex items-center gap-1 bg-black/60 p-1 rounded border border-white/10">
                <button
                  type="button"
                  onClick={() => handleSwitchSite('tps')}
                  className={`px-3 py-1 text-xs font-mono font-bold rounded-sm transition-all flex items-center gap-1.5 cursor-pointer ${
                    isTPS
                      ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  <span>🔎 TruePeopleSearch</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchSite('fps')}
                  className={`px-3 py-1 text-xs font-mono font-bold rounded-sm transition-all flex items-center gap-1.5 cursor-pointer ${
                    !isTPS
                      ? 'bg-neon-warn/20 text-neon-warn border border-neon-warn/50 shadow-[0_0_10px_rgba(255,153,0,0.3)]'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  <span>⚡ FastPeopleSearch</span>
                </button>
              </div>

              {/* Browser navigation controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleBrowserAction('back')}
                  disabled={navigating}
                  className="p-1.5 text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/15 rounded text-white transition-colors cursor-pointer"
                  title="Page précédente"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={() => handleBrowserAction('forward')}
                  disabled={navigating}
                  className="p-1.5 text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/15 rounded text-white transition-colors cursor-pointer"
                  title="Page suivante"
                >
                  ▶
                </button>
                <button
                  type="button"
                  onClick={() => handleBrowserAction('reload')}
                  disabled={navigating}
                  className="px-2 py-1 text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/15 rounded text-white transition-colors cursor-pointer"
                  title="Actualiser la page"
                >
                  ⟳ ACTUALISER
                </button>
                <button
                  type="button"
                  onClick={() => handleBrowserAction(isTPS ? 'home_tps' : 'home_fps')}
                  disabled={navigating}
                  className="px-2 py-1 text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/15 rounded text-white transition-colors cursor-pointer"
                  title="Revenir à l'accueil"
                >
                  🏠 ACCUEIL
                </button>
              </div>

              {/* Selected Number & Manual Copy fallback */}
              {initialPhone && (
                <div className="flex items-center gap-2 bg-black/90 border border-neon-green/30 px-3 py-1 rounded">
                  <span className="text-[0.65rem] font-mono text-text-muted">NUMÉRO :</span>
                  <span className="text-xs font-mono font-bold text-neon-green tracking-wider">
                    {initialPhone}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyNumberToClipboard(initialPhone, targetSite)}
                    className="px-2 py-0.5 text-[0.65rem] font-mono rounded bg-neon-green/20 hover:bg-neon-green/30 text-neon-green border border-neon-green/40 transition-colors cursor-pointer"
                    title="Copier le numéro dans le presse-papiers"
                  >
                    COPIER
                  </button>
                </div>
              )}

              {/* Primary Action: Capture Current Page */}
              <button
                type="button"
                onClick={handleCapturePage}
                disabled={capturing}
                className="btn-cyber px-4 py-1.5 text-xs font-mono font-bold rounded-sm flex items-center gap-2 cursor-pointer shadow-lg"
                style={{
                  borderColor: '#00ff66',
                  color: '#00ff66',
                  background: 'rgba(0, 255, 102, 0.15)',
                  boxShadow: '0 0 15px rgba(0, 255, 102, 0.25)',
                }}
                title="Analyser et extraire uniquement la page actuellement visible dans le navigateur"
              >
                <span>{capturing ? 'ANALYSE DU DOM...' : '📸 CAPTURER CETTE PAGE'}</span>
              </button>
            </div>

            {/* Helper instruction / Clipboard Notification banner */}
            <div className="bg-black/95 px-4 py-1.5 border-b border-white/10 flex items-center justify-between text-[0.7rem] font-mono">
              <div className="flex items-center gap-2">
                <span className="text-yellow-400">💡 CONSEIL :</span>
                <span className="text-text-muted">
                  Collez le numéro ({initialPhone || 'votre recherche'}) avec{' '}
                  <kbd className="px-1 py-0.5 rounded bg-white/10 text-white">Ctrl+V</kbd> dans le champ de recherche du site. Si un CAPTCHA s'affiche, résolvez-le directement à l'écran.
                </span>
              </div>
              {copiedStatus && (
                <span className="text-neon-green font-bold animate-pulse">
                  ✓ {copiedStatus}
                </span>
              )}
            </div>

            {/* Chromium Display Window (Direct RFB Canvas Container) */}
            <div className="flex-1 relative bg-black overflow-hidden flex items-center justify-center">
              {/* Spinner & Loading State */}
              {!rfbConnected && !errorMessage && (
                <div className="absolute inset-0 bg-black/90 z-20 flex flex-col items-center justify-center gap-3">
                  <div className="w-9 h-9 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
                  <div className="text-neon-cyan text-xs font-mono tracking-wider">
                    {connectionStatus.toUpperCase()}
                  </div>
                  <div className="text-text-muted text-[0.7rem] font-mono">
                    Initialisation du flux RFB direct...
                  </div>
                </div>
              )}

              {/* Dedicated RFB Screen Canvas Mount */}
              <div
                ref={canvasContainerRef}
                className="w-full h-full flex items-center justify-center relative overflow-hidden bg-black select-none"
                style={{ cursor: 'default' }}
              />

              {/* Error & Disconnect Overlay */}
              {errorMessage && (
                <div className="absolute inset-0 bg-black/95 z-30 flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="text-4xl">⚠️</div>
                  <div className="text-neon-danger font-mono font-bold text-sm">
                    {errorMessage}
                  </div>
                  <div className="text-text-muted font-mono text-xs max-w-md">
                    Statut actuel : {connectionStatus}
                  </div>
                  <button
                    type="button"
                    onClick={() => initBrowserSession(targetSite, true)}
                    className="btn-cyber px-5 py-2 text-xs font-mono font-bold rounded-sm border-neon-cyan text-neon-cyan hover:bg-neon-cyan/20 cursor-pointer"
                  >
                    ⟳ RÉESSAYER
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      {/* Capture Preview Modal for validation and import */}
      <CapturePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        capturedLeads={capturedLeads}
        source={isTPS ? 'TPS' : 'FPS'}
        currentUrl={activeUrl}
        onImportSuccess={onImportSuccess}
      />
    </>
  )
}
