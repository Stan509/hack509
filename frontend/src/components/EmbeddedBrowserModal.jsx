import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  const [browserReady, setBrowserReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [navigating, setNavigating] = useState(false)
  const [proxyActive, setProxyActive] = useState(false)
  const [proxyProvider, setProxyProvider] = useState('Connexion directe')
  const [copiedStatus, setCopiedStatus] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [activeUrl, setActiveUrl] = useState('')

  // Capture workflow state
  const [capturing, setCapturing] = useState(false)
  const [capturedLeads, setCapturedLeads] = useState([])
  const [previewOpen, setPreviewOpen] = useState(false)

  const iframeRef = useRef(null)

  // VNC stream URL gated with session ticket
  const vncClientUrl = sessionTicket
    ? `/browser/vnc.html?autoconnect=true&resize=scale&reconnect=true&quality=7&compression=2&ticket=${encodeURIComponent(sessionTicket)}&path=websockify%3Fticket%3D${encodeURIComponent(sessionTicket)}`
    : ''

  useEffect(() => {
    if (isOpen) {
      setTargetSite(initialTarget)
      setErrorMessage('')
      initBrowserSession(initialTarget)
      if (initialPhone) {
        copyNumberToClipboard(initialPhone, initialTarget)
      }
    } else {
      setBrowserReady(false)
      setSessionTicket('')
      setPreviewOpen(false)
    }
  }, [isOpen, initialTarget, initialPhone])

  // Heartbeat to keep session lock active
  useEffect(() => {
    if (!isOpen || !sessionTicket) return
    const interval = setInterval(async () => {
      try {
        await api.post('/api/browser/session/heartbeat/', { ticket: sessionTicket })
      } catch (err) {
        console.warn('Heartbeat error:', err)
      }
    }, 20000)
    return () => clearInterval(interval)
  }, [isOpen, sessionTicket])

  const handleClose = async () => {
    try {
      await api.delete('/api/browser/session/')
    } catch (err) {
      console.warn('Close session error:', err)
    }
    setSessionTicket('')
    setBrowserReady(false)
    setPreviewOpen(false)
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
      setCopiedStatus(`Presse-papiers indisponible — utilisez le bouton Copier ci-dessus`)
    }
  }

  const initBrowserSession = async (target) => {
    setLoading(true)
    setErrorMessage('')
    try {
      const resp = await api.post('/api/browser/session/', { target })
      if (resp.data && resp.data.success) {
        setSessionTicket(resp.data.ticket || '')
        setBrowserReady(true)
        setProxyActive(Boolean(resp.data.proxy_active))
        setProxyProvider(resp.data.proxy_provider || 'Connexion directe')
        setActiveUrl(resp.data.target_url || '')
      } else {
        setErrorMessage(resp.data?.error || 'Serveur du navigateur indisponible.')
      }
    } catch (err) {
      console.warn('Browser session init:', err)
      if (err.response?.status === 423 || err.response?.data?.locked) {
        setErrorMessage(err.response?.data?.error || "Le navigateur est actuellement utilisé par un autre opérateur.")
      } else {
        setErrorMessage(err.response?.data?.error || 'Serveur du navigateur indisponible.')
      }
    } finally {
      setLoading(false)
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
    setLoading(true)
    try {
      await api.post('/api/browser/session/', { target: newSite })
      if (initialPhone) {
        copyNumberToClipboard(initialPhone, newSite)
      }
    } catch (err) {
      console.error('Switch site error:', err)
    } finally {
      setLoading(false)
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
      alert("Erreur lors de la capture : " + (err.response?.data?.error || err.message))
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

            {/* Chromium Display Window (noVNC HTML5 Canvas stream) */}
            <div className="flex-1 relative bg-black/95 overflow-hidden flex flex-col items-center justify-center">
              {loading && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-sm z-20 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
                  <div className="text-neon-cyan text-xs font-mono tracking-wider">
                    CONNEXION AU NAVIGATEUR CHROMIUM DISTANT...
                  </div>
                </div>
              )}

              {/* noVNC Web App Iframe */}
              <iframe
                ref={iframeRef}
                src={vncClientUrl}
                title="Remote Chromium Browser Session"
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms"
                onLoad={() => setLoading(false)}
              />

              {errorMessage && (
                <div className="absolute inset-0 bg-black/95 z-30 flex flex-col items-center justify-center p-6 text-center space-y-4">
                  <div className="text-3xl">⚠️</div>
                  <div className="text-neon-danger font-mono font-bold text-sm">
                    {errorMessage}
                  </div>
                  <div className="text-text-muted font-mono text-xs max-w-md">
                    Vérifiez que le conteneur browser est démarré sur le serveur.
                  </div>
                  <button
                    type="button"
                    onClick={() => initBrowserSession(targetSite)}
                    className="btn-cyber px-4 py-2 text-xs font-mono font-bold rounded-sm border-neon-cyan text-neon-cyan"
                  >
                    ⟳ RÉESSAYER LA CONNEXION
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
