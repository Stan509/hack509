import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import RFB from '@novnc/novnc'
import { api } from '../contexts/AuthContext.jsx'
import { useDialer } from '../contexts/DialerContext.jsx'
import CapturePreviewModal from './CapturePreviewModal.jsx'

export default function EmbeddedBrowserModal({
  isOpen,
  onClose,
  initialTarget = 'tps', // 'tps' | 'fps'
  initialPhone = '',
  contactName = '',
  onImportSuccess
}) {
  const { addToQueue } = useDialer()
  const [sessionTicket, setSessionTicket] = useState('')
  const [targetSite, setTargetSite] = useState(initialTarget) // 'tps' | 'fps'
  const [proxyActive, setProxyActive] = useState(false)
  const [proxyProvider, setProxyProvider] = useState('Passerelle US Vercel')
  const [copiedStatus, setCopiedStatus] = useState('')
  const [connectionStatus, setConnectionStatus] = useState('Prêt')
  const [rfbConnected, setRfbConnected] = useState(false)
  const [cloudMode, setCloudMode] = useState(true)

  // Lookup state
  const [searchPhone, setSearchPhone] = useState(initialPhone)
  const [searchName, setSearchName] = useState(contactName)
  const [isSearching, setIsSearching] = useState(false)
  const [searchResults, setSearchResults] = useState([])
  const [searchError, setSearchError] = useState('')
  const [addedQueueId, setAddedQueueId] = useState(null)
  const [savedContactId, setSavedContactId] = useState(null)

  // Manual HTML capture state
  const [pasteHtml, setPasteHtml] = useState('')
  const [showPasteBox, setShowPasteBox] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [capturedLeads, setCapturedLeads] = useState([])
  const [previewOpen, setPreviewOpen] = useState(false)

  const canvasContainerRef = useRef(null)
  const rfbRef = useRef(null)
  const connectingRef = useRef(false)
  const sessionTicketRef = useRef('')
  const isOpenRef = useRef(isOpen)
  isOpenRef.current = isOpen

  // Disconnect & cleanup RFB instance
  const cleanupRfb = useCallback(() => {
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

  const copyNumberToClipboard = async (phoneNum, target) => {
    if (!phoneNum) return
    const siteLabel = target === 'fps' ? 'FPS' : 'TPS'
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(phoneNum)
        setCopiedStatus(`Numéro copié ! Collez-le dans la recherche ${siteLabel}`)
      } else {
        fallbackCopy(phoneNum, siteLabel)
      }
    } catch {
      fallbackCopy(phoneNum, siteLabel)
    }
    setTimeout(() => setCopiedStatus(''), 5000)
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
      setCopiedStatus(`Numéro copié ! Collez-le dans la recherche ${siteLabel}`)
    } catch {
      setCopiedStatus('Presse-papiers indisponible — copiez manuellement')
    }
  }

  // Perform active search through US server/proxy gateway
  const performLookup = useCallback(async (phoneToSearch, nameToSearch, site) => {
    setIsSearching(true)
    setSearchError('')
    setSearchResults([])
    try {
      const resp = await api.post('/api/contacts/tps-lookup/', {
        phone: phoneToSearch || '',
        name: nameToSearch || '',
        provider: site || 'all',
        search_type: phoneToSearch ? 'phone' : 'name'
      })
      if (resp.data && resp.data.results && resp.data.results.length > 0) {
        setSearchResults(resp.data.results)
      } else if (resp.data && resp.data.message) {
        setSearchError(resp.data.message)
      } else {
        setSearchError('Aucun dossier trouvé pour ces critères.')
      }
    } catch (err) {
      console.warn('Lookup error:', err)
      setSearchError(err.response?.data?.error || 'Erreur lors de la communication avec la passerelle US.')
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Attempt RFB connection if available
  const tryConnectRfb = useCallback((ticket) => {
    if (!canvasContainerRef.current) return
    if (connectingRef.current || rfbRef.current) return

    connectingRef.current = true
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const socketUrl = `${scheme}://${window.location.host}/websockify?ticket=${encodeURIComponent(ticket)}`

    try {
      const rfb = new RFB(canvasContainerRef.current, socketUrl, {
        wsProtocols: ['binary']
      })
      rfb.scaleViewport = true
      rfb.resizeSession = true
      rfbRef.current = rfb

      rfb.addEventListener('connect', () => {
        connectingRef.current = false
        setRfbConnected(true)
        setCloudMode(false)
        setConnectionStatus('Navigateur noVNC connecté')
      })

      rfb.addEventListener('disconnect', () => {
        connectingRef.current = false
        setRfbConnected(false)
        setCloudMode(true) // Fallback automatically to Cloud Mode
        setConnectionStatus('Passerelle US Vercel active')
      })
    } catch {
      connectingRef.current = false
      setRfbConnected(false)
      setCloudMode(true)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      setTargetSite(initialTarget)
      setSearchPhone(initialPhone)
      setSearchName(contactName)
      setSearchResults([])
      setSearchError('')
      setCloudMode(true) // Default to cloud mode on Vercel

      if (initialPhone) {
        copyNumberToClipboard(initialPhone, initialTarget)
        performLookup(initialPhone, contactName, initialTarget)
      }

      // Initialize session on backend
      api.post('/api/browser/session/', { target: initialTarget })
        .then((resp) => {
          if (resp.data && resp.data.ticket) {
            sessionTicketRef.current = resp.data.ticket
            setSessionTicket(resp.data.ticket)
            setProxyActive(Boolean(resp.data.proxy_active))
            setProxyProvider(resp.data.proxy_provider || 'Passerelle US Vercel')
            // Try RFB in background
            tryConnectRfb(resp.data.ticket)
          }
        })
        .catch(() => {
          setCloudMode(true)
        })
    } else {
      cleanupRfb()
      sessionTicketRef.current = ''
      setSessionTicket('')
      setSearchResults([])
      setPreviewOpen(false)
    }
    return () => cleanupRfb()
  }, [isOpen, initialTarget, initialPhone, contactName, performLookup, tryConnectRfb, cleanupRfb])

  const handleClose = async () => {
    cleanupRfb()
    try {
      await api.delete('/api/browser/session/')
    } catch {
      // Ignored
    }
    sessionTicketRef.current = ''
    setSessionTicket('')
    setSearchResults([])
    onClose()
  }

  const handleSwitchSite = (site) => {
    setTargetSite(site)
    if (searchPhone || searchName) {
      performLookup(searchPhone, searchName, site)
    }
  }

  const handleAddLeadToQueue = (lead, idx) => {
    const contactObj = {
      id: `tps_${Date.now()}_${idx}`,
      first_name: lead.first_name || '',
      last_name: lead.last_name || 'Prospect TPS/FPS',
      phone: lead.phone || lead.lookup_phone || '',
      address: lead.address || '',
      city: lead.city || '',
      state: lead.state || '',
      company: lead.carrier || lead.company || 'TPS/FPS',
      status: 'pending',
      notes: `Ajouté depuis ${lead.source || targetSite.toUpperCase()}. Âge: ${lead.age || 'N/A'}. Proches: ${lead.relatives || 'N/A'}.`
    }
    if (addToQueue) {
      addToQueue(contactObj)
      setAddedQueueId(idx)
      setTimeout(() => setAddedQueueId(null), 3000)
    }
  }

  const handleSaveContact = async (lead, idx) => {
    try {
      const payload = {
        first_name: lead.first_name || 'Prospect',
        last_name: lead.last_name || 'TPS/FPS',
        phone: lead.phone || lead.lookup_phone || '',
        address: lead.address || '',
        city: lead.city || '',
        state: lead.state || '',
        company: lead.carrier || lead.company || '',
        status: 'new',
        notes: `Importé depuis ${lead.source || targetSite.toUpperCase()}. Âge: ${lead.age || 'N/A'}. Proches: ${lead.relatives || 'N/A'}.`
      }
      await api.post('/api/contacts/', payload)
      setSavedContactId(idx)
      if (onImportSuccess) onImportSuccess()
      setTimeout(() => setSavedContactId(null), 3000)
    } catch (err) {
      alert('Erreur lors de la sauvegarde : ' + (err.response?.data?.error || err.message))
    }
  }

  const handleParsePastedHtml = async () => {
    if (!pasteHtml.trim()) return
    setCapturing(true)
    try {
      const resp = await api.post('/api/browser/capture/', {
        html: pasteHtml,
        url: targetSite === 'fps' ? 'https://www.fastpeoplesearch.com' : 'https://www.truepeoplesearch.com'
      })
      if (resp.data && resp.data.results && resp.data.results.length > 0) {
        setCapturedLeads(resp.data.results)
        setPreviewOpen(true)
        setShowPasteBox(false)
        setPasteHtml('')
      } else {
        alert('Aucun dossier extrait du code HTML collé.')
      }
    } catch (err) {
      alert('Erreur d’analyse : ' + (err.response?.data?.error || err.message))
    } finally {
      setCapturing(false)
    }
  }

  if (!isOpen) return null

  const isTPS = targetSite === 'tps'
  const siteTitle = isTPS ? 'TruePeopleSearch (TPS)' : 'FastPeopleSearch (FPS)'
  const siteAccent = isTPS ? '#00d4ff' : '#ff9900'

  const rawDigits = (searchPhone || '').replace(/\D/g, '')
  const cleanDigits = rawDigits.startsWith('1') && rawDigits.length === 11 ? rawDigits.slice(1) : rawDigits

  const tpsDirectUrl = cleanDigits
    ? `https://www.truepeoplesearch.com/results?phoneno=${cleanDigits}`
    : `https://www.truepeoplesearch.com`
  const fpsDirectUrl = cleanDigits
    ? `https://www.fastpeoplesearch.com/phone/${cleanDigits}`
    : `https://www.fastpeoplesearch.com`

  return (
    <>
      <AnimatePresence>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4"
          style={{ background: 'rgba(0, 0, 0, 0.88)', backdropFilter: 'blur(8px)' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            className="card-cyber w-full max-w-5xl h-[92vh] flex flex-col rounded overflow-hidden shadow-2xl bg-black/95 text-white"
            style={{
              border: `1px solid ${siteAccent}66`,
              boxShadow: `0 0 50px ${siteAccent}22`,
            }}
          >
            {/* Top Bar: Title & Status Badges */}
            <div className="bg-black/95 px-4 py-2.5 border-b border-white/10 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleClose}
                  className="w-3.5 h-3.5 rounded-full bg-red-500 hover:brightness-125 transition-all cursor-pointer"
                  title="Fermer"
                />
                <div className="w-3.5 h-3.5 rounded-full bg-yellow-500 opacity-60" />
                <div className="w-3.5 h-3.5 rounded-full bg-green-500 opacity-60" />
                <div className="h-4 w-px bg-white/20 mx-1" />
                <div className="terminal-header flex items-center gap-2 text-xs font-bold">
                  <span style={{ color: siteAccent }}>PASSERELLE RECHERCHE US</span>
                  <span className="text-text-muted hidden sm:inline">[{siteTitle}]</span>
                </div>
              </div>

              {/* Status and Mode Indicators */}
              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm border text-[0.65rem] font-mono"
                  style={{
                    borderColor: '#00ff66',
                    color: '#00ff66',
                    background: 'rgba(0,255,102,0.1)',
                  }}
                  title="Toutes les requêtes passent par l’adresse IP US du serveur Vercel ou proxy configuré"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
                  <span className="font-bold">PASSERELLE US : ACTIVE</span>
                </div>

                {rfbConnected && (
                  <button
                    type="button"
                    onClick={() => setCloudMode(!cloudMode)}
                    className="px-2 py-0.5 text-[0.65rem] font-mono rounded border border-neon-cyan text-neon-cyan hover:bg-neon-cyan/20 cursor-pointer"
                  >
                    {cloudMode ? '🖥 VOIR FLUX VNC' : '📋 VOIR PORTAIL CLOUD'}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleClose}
                  className="text-text-muted hover:text-neon-danger text-xs font-mono px-2 py-0.5 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Navigation & Controls Ribbon */}
            <div className="bg-black/80 px-4 py-2 border-b border-white/10 flex flex-wrap items-center justify-between gap-2.5 flex-shrink-0">
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

              {/* Direct Open Link Buttons */}
              <div className="flex items-center gap-2">
                <a
                  href={isTPS ? tpsDirectUrl : fpsDirectUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-cyber px-3 py-1 text-xs font-mono font-bold rounded-sm flex items-center gap-1.5 cursor-pointer"
                  style={{
                    borderColor: siteAccent,
                    color: siteAccent,
                    background: `${siteAccent}15`,
                    boxShadow: `0 0 10px ${siteAccent}22`,
                  }}
                  title="Ouvrir directement la fiche pré-remplie dans un nouvel onglet"
                >
                  <span>🌐 OUVRIR SUR {isTPS ? 'TPS' : 'FPS'} ↗</span>
                </a>

                <button
                  type="button"
                  onClick={() => setShowPasteBox(!showPasteBox)}
                  className="px-2.5 py-1 text-xs font-mono rounded bg-white/5 hover:bg-white/10 border border-white/20 text-white cursor-pointer"
                  title="Coller du HTML ou du texte depuis le site"
                >
                  <span>📋 COLLER HTML</span>
                </button>
              </div>
            </div>

            {/* Quick Search & Pre-fill Banner */}
            <div className="bg-black/90 p-3 border-b border-white/10 flex flex-wrap items-center gap-3">
              <div className="flex-1 flex items-center gap-2 min-w-[260px]">
                <span className="text-xs font-mono text-text-muted shrink-0">📞 TÉL :</span>
                <input
                  type="text"
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  placeholder="Numéro USA (+1...)"
                  className="input-cyber py-1.5 px-3 text-xs font-mono flex-1 rounded bg-black/60 border border-white/20 text-neon-green font-bold tracking-wider"
                />
                {searchPhone && (
                  <button
                    type="button"
                    onClick={() => copyNumberToClipboard(searchPhone, targetSite)}
                    className="px-2.5 py-1.5 text-xs font-mono font-bold rounded bg-neon-green/20 hover:bg-neon-green/30 text-neon-green border border-neon-green/50 cursor-pointer shrink-0"
                    title="Copier le numéro"
                  >
                    📋 COPIER
                  </button>
                )}
              </div>

              <div className="flex-1 flex items-center gap-2 min-w-[220px]">
                <span className="text-xs font-mono text-text-muted shrink-0">👤 NOM :</span>
                <input
                  type="text"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="Nom du prospect"
                  className="input-cyber py-1.5 px-3 text-xs font-mono flex-1 rounded bg-black/60 border border-white/20 text-white"
                />
              </div>

              <button
                type="button"
                onClick={() => performLookup(searchPhone, searchName, targetSite)}
                disabled={isSearching}
                className="btn-cyber px-4 py-1.5 text-xs font-mono font-bold rounded cursor-pointer shrink-0 flex items-center gap-1.5"
                style={{
                  borderColor: '#00d4ff',
                  color: '#00d4ff',
                  background: 'rgba(0, 212, 255, 0.15)',
                }}
              >
                <span>{isSearching ? '⏳ EN COURS...' : '⚡ RECHERCHER VIA PASSERELLE'}</span>
              </button>
            </div>

            {/* Feedback notification banner */}
            {copiedStatus && (
              <div className="bg-neon-green/10 border-b border-neon-green/30 px-4 py-1 text-xs font-mono text-neon-green font-bold flex items-center gap-2 animate-pulse">
                <span>✓</span>
                <span>{copiedStatus}</span>
              </div>
            )}

            {/* Optional Paste HTML Area */}
            {showPasteBox && (
              <div className="bg-black/90 p-3 border-b border-white/10 flex flex-col gap-2">
                <div className="text-xs font-mono text-yellow-400 font-bold">
                  📋 Extraction manuelle : collez ci-dessous le code HTML ou texte de la page {isTPS ? 'TPS' : 'FPS'} :
                </div>
                <textarea
                  value={pasteHtml}
                  onChange={(e) => setPasteHtml(e.target.value)}
                  placeholder="Collez ici le code source ou le contenu de la page ouverte dans votre navigateur..."
                  rows={4}
                  className="input-cyber p-2 text-xs font-mono bg-black/80 border border-white/20 rounded text-text-muted focus:text-white"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowPasteBox(false)}
                    className="px-3 py-1 text-xs font-mono rounded bg-white/5 hover:bg-white/10 text-text-muted"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleParsePastedHtml}
                    disabled={capturing || !pasteHtml.trim()}
                    className="btn-cyber px-4 py-1 text-xs font-mono font-bold rounded"
                    style={{ borderColor: '#00ff66', color: '#00ff66' }}
                  >
                    {capturing ? 'Analyse...' : '📸 Extraire les prospects'}
                  </button>
                </div>
              </div>
            )}

            {/* Main Content Area */}
            <div className="flex-1 overflow-y-auto p-4 relative">
              {/* Optional noVNC Display if connected */}
              {!cloudMode && rfbConnected ? (
                <div className="w-full h-full relative bg-black flex items-center justify-center">
                  <div
                    ref={canvasContainerRef}
                    className="w-full h-full flex items-center justify-center relative overflow-hidden bg-black select-none"
                  />
                </div>
              ) : (
                /* Cloud Mode: Results & Intelligence Cards */
                <div className="space-y-4">
                  {isSearching ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <div className="w-10 h-10 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
                      <div className="text-neon-cyan text-sm font-mono tracking-wider font-bold">
                        INTERROGATION DE LA PASSERELLE US / PROXY EN COURS...
                      </div>
                      <div className="text-text-muted text-xs font-mono">
                        Routage des requêtes TPS & FPS à travers l'infrastructure américaine
                      </div>
                    </div>
                  ) : searchResults.length > 0 ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-mono text-neon-green font-bold">
                          DOSSIERS DISPONIBLES ({searchResults.length}) :
                        </div>
                        <div className="text-[0.7rem] font-mono text-text-muted">
                          Source : Passerelle US & Dossiers Publics
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {searchResults.map((lead, idx) => {
                          const fullName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Prospect Détecté'
                          const isAdded = addedQueueId === idx
                          const isSaved = savedContactId === idx

                          return (
                            <motion.div
                              key={idx}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: idx * 0.05 }}
                              className="card-cyber p-4 rounded border border-white/15 bg-black/60 flex flex-col justify-between gap-3 hover:border-neon-cyan/50 transition-all"
                            >
                              <div className="space-y-2">
                                <div className="flex items-start justify-between gap-2">
                                  <div>
                                    <div className="text-sm font-mono font-bold text-white tracking-wide">
                                      👤 {fullName}
                                    </div>
                                    {lead.age && lead.age !== 'N/A' && (
                                      <div className="text-[0.7rem] font-mono text-text-muted">
                                        Âge estimé : <span className="text-yellow-400 font-bold">{lead.age} ans</span>
                                      </div>
                                    )}
                                  </div>
                                  <span className="px-2 py-0.5 rounded text-[0.65rem] font-mono bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan shrink-0">
                                    {lead.source || targetSite.toUpperCase()}
                                  </span>
                                </div>

                                <div className="text-xs font-mono space-y-1 bg-black/40 p-2.5 rounded border border-white/5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-text-muted">📞 Tél :</span>
                                    <span className="text-neon-green font-bold tracking-wider">{lead.phone || lead.lookup_phone}</span>
                                  </div>
                                  {lead.carrier && (
                                    <div className="flex items-center justify-between">
                                      <span className="text-text-muted">🏢 Opérateur :</span>
                                      <span className="text-yellow-400 font-bold">{lead.carrier}</span>
                                    </div>
                                  )}
                                  <div className="flex items-start justify-between gap-2 pt-1 border-t border-white/5">
                                    <span className="text-text-muted shrink-0">🏠 Adresse :</span>
                                    <span className="text-right text-text-muted truncate max-w-[220px]">{lead.address || 'Non spécifiée'}</span>
                                  </div>
                                  {lead.relatives && (
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="text-text-muted shrink-0">👥 Proches :</span>
                                      <span className="text-right text-text-muted truncate max-w-[220px]">
                                        {Array.isArray(lead.relatives) ? lead.relatives.join(', ') : lead.relatives}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Card Actions */}
                              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                                <button
                                  type="button"
                                  onClick={() => handleAddLeadToQueue(lead, idx)}
                                  className={`btn-cyber py-1.5 text-xs font-mono font-bold rounded flex items-center justify-center gap-1.5 cursor-pointer ${
                                    isAdded ? 'bg-neon-green/30 border-neon-green text-neon-green' : ''
                                  }`}
                                  style={{ borderColor: '#00ff66', color: '#00ff66' }}
                                >
                                  <span>{isAdded ? '✓ AJOUTÉ !' : '⚡ METTRE EN FILE'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleSaveContact(lead, idx)}
                                  className={`btn-cyber py-1.5 text-xs font-mono font-bold rounded flex items-center justify-center gap-1.5 cursor-pointer ${
                                    isSaved ? 'bg-neon-cyan/30 border-neon-cyan text-neon-cyan' : ''
                                  }`}
                                  style={{ borderColor: '#00d4ff', color: '#00d4ff' }}
                                >
                                  <span>{isSaved ? '✓ SAUVEGARDÉ !' : '💾 ENREGISTRER'}</span>
                                </button>
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    /* Initial Guidance / Empty State */
                    <div className="flex flex-col items-center justify-center py-12 text-center max-w-lg mx-auto space-y-4">
                      <div className="w-14 h-14 rounded-full bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center text-2xl text-neon-cyan">
                        🌐
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-sm font-mono font-bold text-white">
                          PORTAIL CLOUD INTELLIGENCE TPS & FPS
                        </h3>
                        <p className="text-xs font-mono text-text-muted">
                          {searchError || 'Entrez un numéro américain ci-dessus pour interroger la base publique via la passerelle US sécurisée.'}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full pt-2">
                        <a
                          href={tpsDirectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-cyber py-2.5 px-3 text-xs font-mono font-bold rounded flex items-center justify-center gap-1.5 cursor-pointer"
                          style={{ borderColor: '#00d4ff', color: '#00d4ff', background: 'rgba(0,212,255,0.1)' }}
                        >
                          <span>🔎 TruePeopleSearch ↗</span>
                        </a>

                        <a
                          href={fpsDirectUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-cyber py-2.5 px-3 text-xs font-mono font-bold rounded flex items-center justify-center gap-1.5 cursor-pointer"
                          style={{ borderColor: '#ff9900', color: '#ff9900', background: 'rgba(255,153,0,0.1)' }}
                        >
                          <span>⚡ FastPeopleSearch ↗</span>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Footer Info */}
            <div className="bg-black/95 px-4 py-2 border-t border-white/10 flex items-center justify-between text-[0.65rem] font-mono text-text-muted">
              <div>
                Routage : <span className="text-neon-cyan">{proxyProvider}</span> | Localisation : <span className="text-neon-green">Ashburn, VA (USA)</span>
              </div>
              <div>
                HACK509 // MODULE INTELLIGENCE PROSPECT TPS / FPS
              </div>
            </div>
          </motion.div>
        </div>
      </AnimatePresence>

      {/* Capture Preview Modal */}
      <CapturePreviewModal
        isOpen={previewOpen}
        onClose={() => setPreviewOpen(false)}
        capturedLeads={capturedLeads}
        source={isTPS ? 'TPS' : 'FPS'}
        currentUrl={isTPS ? tpsDirectUrl : fpsDirectUrl}
        onImportSuccess={onImportSuccess}
      />
    </>
  )
}
