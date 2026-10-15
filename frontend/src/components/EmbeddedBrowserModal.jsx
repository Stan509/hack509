import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
  const [targetSite, setTargetSite] = useState(initialTarget) // 'tps' | 'fps'
  const [searchPhone, setSearchPhone] = useState(initialPhone)
  const [searchName, setSearchName] = useState(contactName)
  const [activeUrl, setActiveUrl] = useState('')
  const [inputUrl, setInputUrl] = useState('')
  const [iframeLoading, setIframeLoading] = useState(true)
  const [copiedStatus, setCopiedStatus] = useState('')
  const [activeTab, setActiveTab] = useState('browser') // 'browser' | 'cards'
  const [proxyProvider, setProxyProvider] = useState('Passerelle US Vercel')

  // History stack for in-app browser
  const [history, setHistory] = useState([])
  const [historyIdx, setHistoryIdx] = useState(-1)

  // Card Intelligence State
  const [isSearchingCards, setIsSearchingCards] = useState(false)
  const [cardResults, setCardResults] = useState([])
  const [addedQueue, setAddedQueue] = useState(false)
  const [savedContact, setSavedContact] = useState(false)

  // Capture modal
  const [previewOpen, setPreviewOpen] = useState(false)
  const [capturedLeads, setCapturedLeads] = useState([])
  const [capturing, setCapturing] = useState(false)

  const iframeRef = useRef(null)

  const getCleanDigits = (phoneStr) => {
    const raw = (phoneStr || '').replace(/\D/g, '')
    return raw.startsWith('1') && raw.length === 11 ? raw.slice(1) : raw
  }

  const computeSiteUrl = useCallback((site, phone, name) => {
    const digits = getCleanDigits(phone)
    if (site === 'fps') {
      if (digits) return `https://www.fastpeoplesearch.com/phone/${digits}`
      if (name) return `https://www.fastpeoplesearch.com/name/${encodeURIComponent(name.trim().replace(/\s+/g, '-'))}`
      return 'https://www.fastpeoplesearch.com'
    } else {
      if (digits) return `https://www.truepeoplesearch.com/results?phoneno=${digits}`
      if (name) return `https://www.truepeoplesearch.com/results?name=${encodeURIComponent(name.trim())}`
      return 'https://www.truepeoplesearch.com'
    }
  }, [])

  const navigateTo = useCallback((newUrl) => {
    setActiveUrl(newUrl)
    setInputUrl(newUrl)
    setIframeLoading(true)
    setHistory((prev) => {
      const updated = prev.slice(0, historyIdx + 1)
      return [...updated, newUrl]
    })
    setHistoryIdx((prev) => prev + 1)
  }, [historyIdx])

  const copyNumber = async (phoneToCopy) => {
    if (!phoneToCopy) return
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(phoneToCopy)
        setCopiedStatus('Numéro copié dans le presse-papiers !')
      } else {
        const ta = document.createElement('textarea')
        ta.value = phoneToCopy
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        setCopiedStatus('Numéro copié dans le presse-papiers !')
      }
    } catch {
      setCopiedStatus('Presse-papiers non disponible')
    }
    setTimeout(() => setCopiedStatus(''), 4000)
  }

  // Query background dossier intelligence
  const fetchCardIntelligence = useCallback(async (phone, name, site) => {
    setIsSearchingCards(true)
    try {
      const resp = await api.post('/api/contacts/tps-lookup/', {
        phone: phone || '',
        name: name || '',
        provider: site || 'all',
        search_type: phone ? 'phone' : 'name'
      })
      if (resp.data && resp.data.results) {
        setCardResults(resp.data.results)
      }
    } catch (e) {
      console.warn('Card lookup notice:', e)
    } finally {
      setIsSearchingCards(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      setTargetSite(initialTarget)
      setSearchPhone(initialPhone)
      setSearchName(contactName)
      setActiveTab('browser')
      setAddedQueue(false)
      setSavedContact(false)

      const startUrl = computeSiteUrl(initialTarget, initialPhone, contactName)
      setActiveUrl(startUrl)
      setInputUrl(startUrl)
      setHistory([startUrl])
      setHistoryIdx(0)
      setIframeLoading(true)

      if (initialPhone) {
        copyNumber(initialPhone)
        fetchCardIntelligence(initialPhone, contactName, initialTarget)
      }

      // Check proxy provider status
      api.get('/api/browser/proxy/')
        .then(res => {
          if (res.data?.enabled) {
            setProxyProvider(`Proxy ${res.data.provider || 'Decodo'} (${res.data.host || 'US'})`)
          } else {
            setProxyProvider('Passerelle US Vercel (Ashburn, VA)')
          }
        })
        .catch(() => setProxyProvider('Passerelle US Vercel'))
    } else {
      setActiveUrl('')
      setHistory([])
      setHistoryIdx(-1)
      setCardResults([])
    }
  }, [isOpen, initialTarget, initialPhone, contactName, computeSiteUrl, fetchCardIntelligence])

  const handleSwitchTarget = (site) => {
    setTargetSite(site)
    const newUrl = computeSiteUrl(site, searchPhone, searchName)
    navigateTo(newUrl)
    fetchCardIntelligence(searchPhone, searchName, site)
  }

  const handleSearchSubmit = (e) => {
    if (e) e.preventDefault()
    const newUrl = computeSiteUrl(targetSite, searchPhone, searchName)
    navigateTo(newUrl)
    if (searchPhone) copyNumber(searchPhone)
    fetchCardIntelligence(searchPhone, searchName, targetSite)
  }

  const handleUrlBarSubmit = (e) => {
    if (e) e.preventDefault()
    let u = inputUrl.trim()
    if (!u.startsWith('http://') && !u.startsWith('https://')) {
      u = 'https://' + u
    }
    navigateTo(u)
  }

  const handleBack = () => {
    if (historyIdx > 0) {
      const prevUrl = history[historyIdx - 1]
      setHistoryIdx(historyIdx - 1)
      setActiveUrl(prevUrl)
      setInputUrl(prevUrl)
      setIframeLoading(true)
    }
  }

  const handleForward = () => {
    if (historyIdx < history.length - 1) {
      const nextUrl = history[historyIdx + 1]
      setHistoryIdx(historyIdx + 1)
      setActiveUrl(nextUrl)
      setInputUrl(nextUrl)
      setIframeLoading(true)
    }
  }

  const handleReload = () => {
    setIframeLoading(true)
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src
    }
  }

  const handleAddToQueue = (lead) => {
    const contactObj = {
      id: `lead_${Date.now()}`,
      first_name: lead?.first_name || 'Prospect',
      last_name: lead?.last_name || 'TPS/FPS',
      phone: lead?.phone || searchPhone || '',
      address: lead?.address || '',
      company: lead?.carrier || lead?.company || 'TPS/FPS',
      status: 'pending',
      notes: `Ajouté depuis le mini-navigateur ${targetSite.toUpperCase()}. ${lead?.carrier ? `Opérateur: ${lead.carrier}.` : ''}`
    }
    if (addToQueue) {
      addToQueue(contactObj)
      setAddedQueue(true)
      setTimeout(() => setAddedQueue(false), 3000)
    }
  }

  const handleSaveContact = async (lead) => {
    try {
      await api.post('/api/contacts/', {
        first_name: lead?.first_name || 'Prospect',
        last_name: lead?.last_name || 'TPS/FPS',
        phone: lead?.phone || searchPhone || '',
        address: lead?.address || '',
        company: lead?.carrier || lead?.company || '',
        status: 'new',
        notes: `Importé via mini-navigateur ${targetSite.toUpperCase()}. ${lead?.carrier ? `Opérateur: ${lead.carrier}` : ''}`
      })
      setSavedContact(true)
      if (onImportSuccess) onImportSuccess()
      setTimeout(() => setSavedContact(false), 3000)
    } catch (e) {
      alert('Erreur de sauvegarde: ' + (e.response?.data?.message || e.message))
    }
  }

  const handleCaptureFromBrowser = async () => {
    setCapturing(true)
    try {
      const resp = await api.post('/api/browser/capture/', {
        phone: searchPhone,
        target: targetSite,
        url: activeUrl
      })
      if (resp.data && resp.data.results && resp.data.results.length > 0) {
        setCapturedLeads(resp.data.results)
        setPreviewOpen(true)
      } else {
        alert('Aucun dossier extrait de cette page.')
      }
    } catch (err) {
      alert('Erreur d’analyse : ' + (err.response?.data?.error || err.message))
    } finally {
      setCapturing(false)
    }
  }

  if (!isOpen) return null

  const isTPS = targetSite === 'tps'
  const siteAccent = isTPS ? '#00d4ff' : '#ff9900'
  const siteLabel = isTPS ? 'TruePeopleSearch' : 'FastPeopleSearch'

  const token = localStorage.getItem('access_token') || ''
  const renderFrameSrc = activeUrl
    ? `/api/browser/render/?url=${encodeURIComponent(activeUrl)}&target=${targetSite}&phone=${encodeURIComponent(searchPhone)}&token=${encodeURIComponent(token)}`
    : 'about:blank'

  const activeLead = cardResults[0] || null

  return (
    <>
      <AnimatePresence>
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-3"
          style={{ background: 'rgba(0, 0, 0, 0.88)', backdropFilter: 'blur(8px)' }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 12 }}
            className="card-cyber w-full max-w-[96vw] xl:max-w-7xl h-[94vh] flex flex-col rounded-lg overflow-hidden shadow-2xl bg-[#090d14] text-white"
            style={{
              border: `1px solid ${siteAccent}66`,
              boxShadow: `0 0 45px ${siteAccent}22`,
            }}
          >
            {/* Top Bar: Controls & Status */}
            <div className="bg-black/95 px-3 py-2 border-b border-white/10 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-3.5 h-3.5 rounded-full bg-red-500 hover:brightness-125 transition-all cursor-pointer"
                  title="Fermer"
                />
                <div className="w-3.5 h-3.5 rounded-full bg-yellow-500 opacity-60" />
                <div className="w-3.5 h-3.5 rounded-full bg-green-500 opacity-60" />
                <div className="h-4 w-px bg-white/20 mx-1" />
                <div className="terminal-header flex items-center gap-2 text-xs font-bold">
                  <span style={{ color: siteAccent }}>MINI-NAVIGATEUR INTÉGRÉ HACK509</span>
                  <span className="text-text-muted hidden md:inline">[{siteLabel}]</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[0.65rem] font-mono border"
                  style={{ borderColor: '#00ff66', color: '#00ff66', background: 'rgba(0,255,102,0.1)' }}
                  title="Requêtes routées à travers la passerelle américaine"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
                  <span className="font-bold hidden sm:inline">ROUTAGE US :</span>
                  <span>{proxyProvider}</span>
                </div>

                <div className="flex items-center bg-black/60 p-0.5 rounded border border-white/15">
                  <button
                    type="button"
                    onClick={() => setActiveTab('browser')}
                    className={`px-2.5 py-0.5 text-xs font-mono font-bold rounded transition-all cursor-pointer ${
                      activeTab === 'browser' ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50' : 'text-text-muted hover:text-white'
                    }`}
                  >
                    🌐 Navigateur
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('cards')}
                    className={`px-2.5 py-0.5 text-xs font-mono font-bold rounded transition-all cursor-pointer ${
                      activeTab === 'cards' ? 'bg-neon-warn/20 text-neon-warn border border-neon-warn/50' : 'text-text-muted hover:text-white'
                    }`}
                  >
                    📋 Fiches ({cardResults.length})
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onClose}
                  className="text-text-muted hover:text-neon-danger text-xs font-mono px-2 py-0.5 transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Navigation & Search Bar */}
            <div className="bg-black/85 px-3 py-2 border-b border-white/10 flex flex-wrap items-center gap-2 shrink-0">
              {/* Back / Forward / Reload */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={historyIdx <= 0}
                  className="px-2 py-1 text-xs font-mono rounded bg-white/5 hover:bg-white/15 border border-white/15 disabled:opacity-30 cursor-pointer"
                  title="Précédent"
                >
                  ◀
                </button>
                <button
                  type="button"
                  onClick={handleForward}
                  disabled={historyIdx >= history.length - 1}
                  className="px-2 py-1 text-xs font-mono rounded bg-white/5 hover:bg-white/15 border border-white/15 disabled:opacity-30 cursor-pointer"
                  title="Suivant"
                >
                  ▶
                </button>
                <button
                  type="button"
                  onClick={handleReload}
                  className="px-2 py-1 text-xs font-mono rounded bg-white/5 hover:bg-white/15 border border-white/15 cursor-pointer"
                  title="Recharger"
                >
                  ⟳
                </button>
              </div>

              {/* Site selector tabs */}
              <div className="flex items-center gap-1 bg-black/60 p-0.5 rounded border border-white/15">
                <button
                  type="button"
                  onClick={() => handleSwitchTarget('tps')}
                  className={`px-2.5 py-1 text-xs font-mono font-bold rounded transition-all cursor-pointer ${
                    isTPS
                      ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  🔎 TPS
                </button>
                <button
                  type="button"
                  onClick={() => handleSwitchTarget('fps')}
                  className={`px-2.5 py-1 text-xs font-mono font-bold rounded transition-all cursor-pointer ${
                    !isTPS
                      ? 'bg-neon-warn/20 text-neon-warn border border-neon-warn/50 shadow-[0_0_10px_rgba(255,153,0,0.3)]'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  ⚡ FPS
                </button>
              </div>

              {/* Quick Search Controls (Phone & Name) */}
              <form onSubmit={handleSearchSubmit} className="flex-1 flex items-center gap-1.5 min-w-[280px]">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchPhone}
                    onChange={(e) => setSearchPhone(e.target.value)}
                    placeholder="Numéro USA (+1...)"
                    className="input-cyber w-full py-1 px-2.5 text-xs font-mono rounded bg-black/70 border border-white/20 text-neon-green font-bold tracking-wider"
                  />
                  {searchPhone && (
                    <button
                      type="button"
                      onClick={() => copyNumber(searchPhone)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-neon-green/20 text-neon-green text-[0.65rem] font-mono hover:bg-neon-green/30"
                      title="Copier le numéro"
                    >
                      COPIER
                    </button>
                  )}
                </div>

                <input
                  type="text"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  placeholder="Nom (optionnel)"
                  className="input-cyber w-32 md:w-44 py-1 px-2.5 text-xs font-mono rounded bg-black/70 border border-white/20 text-white"
                />

                <button
                  type="submit"
                  className="btn-cyber py-1 px-3 text-xs font-mono font-bold rounded shrink-0 cursor-pointer"
                  style={{ borderColor: siteAccent, color: siteAccent, background: `${siteAccent}15` }}
                >
                  🔍 RECHERCHER
                </button>
              </form>

              {/* Primary action buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleAddToQueue(activeLead)}
                  className={`btn-cyber py-1 px-3 text-xs font-mono font-bold rounded cursor-pointer ${
                    addedQueue ? 'bg-neon-green/30 text-neon-green border-neon-green' : ''
                  }`}
                  style={{ borderColor: '#00ff66', color: '#00ff66' }}
                  title="Ajouter ce numéro à la file d'attente du dialer"
                >
                  {addedQueue ? '✓ EN FILE' : '⚡ METTRE EN FILE'}
                </button>

                <button
                  type="button"
                  onClick={handleCaptureFromBrowser}
                  disabled={capturing}
                  className="btn-cyber py-1 px-3 text-xs font-mono font-bold rounded cursor-pointer"
                  style={{ borderColor: '#00d4ff', color: '#00d4ff', background: 'rgba(0,212,255,0.1)' }}
                  title="Extraire les contacts de cette page"
                >
                  {capturing ? 'Analyse...' : '📸 CAPTURER'}
                </button>
              </div>
            </div>

            {/* Address Bar */}
            <form onSubmit={handleUrlBarSubmit} className="bg-black/95 px-3 py-1 border-b border-white/10 flex items-center gap-2 shrink-0">
              <span className="text-[0.65rem] font-mono text-text-muted shrink-0">URL :</span>
              <input
                type="text"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                className="w-full bg-transparent text-[0.7rem] font-mono text-text-muted focus:text-white outline-none"
              />
              {copiedStatus && (
                <span className="text-neon-green text-[0.7rem] font-mono font-bold shrink-0 animate-pulse">
                  ✓ {copiedStatus}
                </span>
              )}
            </form>

            {/* Main Workspace */}
            <div className="flex-1 relative bg-black overflow-hidden">
              {activeTab === 'browser' ? (
                /* IN-APP EMBEDDED WEB BROWSER FRAME */
                <div className="w-full h-full relative">
                  {iframeLoading && (
                    <div className="absolute inset-0 bg-black/90 z-10 flex flex-col items-center justify-center gap-3">
                      <div className="w-9 h-9 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
                      <div className="text-neon-cyan text-xs font-mono tracking-wider font-bold">
                        CHARGEMENT DU SITE DANS LE MINI-NAVIGATEUR HACK509...
                      </div>
                      <div className="text-text-muted text-[0.7rem] font-mono">
                        Routage sécurisé via {proxyProvider}
                      </div>
                    </div>
                  )}

                  <iframe
                    ref={iframeRef}
                    src={renderFrameSrc}
                    onLoad={() => setIframeLoading(false)}
                    className="w-full h-full border-none bg-white"
                    title="Hack509 Mini Browser"
                    sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
                  />
                </div>
              ) : (
                /* DOSSIERS INTELLIGENCE TAB */
                <div className="w-full h-full overflow-y-auto p-4 space-y-3 bg-[#0a0f18]">
                  <div className="text-xs font-mono text-neon-green font-bold">
                    DOSSIERS PUBLICS EXTRAITS POUR CE NUMÉRO ({cardResults.length}) :
                  </div>

                  {isSearchingCards ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2">
                      <div className="w-8 h-8 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
                      <div className="text-xs font-mono text-neon-cyan">Interrogation de la passerelle en cours...</div>
                    </div>
                  ) : cardResults.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {cardResults.map((lead, idx) => (
                        <div key={idx} className="card-cyber p-4 rounded border border-white/20 bg-black/60 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="text-sm font-bold text-white font-mono">
                                👤 {lead.first_name} {lead.last_name}
                              </div>
                              {lead.age && lead.age !== 'N/A' && (
                                <div className="text-xs text-yellow-400 font-mono">Âge: {lead.age} ans</div>
                              )}
                            </div>
                            <span className="text-[0.65rem] font-mono px-2 py-0.5 rounded bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30">
                              {lead.source || targetSite.toUpperCase()}
                            </span>
                          </div>

                          <div className="text-xs font-mono space-y-1 bg-black/50 p-2.5 rounded border border-white/5">
                            <div className="flex justify-between">
                              <span className="text-text-muted">Téléphone :</span>
                              <span className="text-neon-green font-bold">{lead.phone || searchPhone}</span>
                            </div>
                            {lead.carrier && (
                              <div className="flex justify-between">
                                <span className="text-text-muted">Opérateur :</span>
                                <span className="text-yellow-400 font-bold">{lead.carrier}</span>
                              </div>
                            )}
                            <div className="flex justify-between">
                              <span className="text-text-muted">Adresse :</span>
                              <span className="text-text-muted">{lead.address || 'Non spécifiée'}</span>
                            </div>
                            {lead.relatives && (
                              <div className="flex justify-between">
                                <span className="text-text-muted">Proches :</span>
                                <span className="text-text-muted">{Array.isArray(lead.relatives) ? lead.relatives.join(', ') : lead.relatives}</span>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/10">
                            <button
                              type="button"
                              onClick={() => handleAddToQueue(lead)}
                              className="btn-cyber py-1.5 text-xs font-mono font-bold rounded"
                              style={{ borderColor: '#00ff66', color: '#00ff66' }}
                            >
                              ⚡ METTRE EN FILE
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveContact(lead)}
                              className="btn-cyber py-1.5 text-xs font-mono font-bold rounded"
                              style={{ borderColor: '#00d4ff', color: '#00d4ff' }}
                            >
                              💾 ENREGISTRER
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 text-xs font-mono text-text-muted">
                      Aucun dossier extrait automatiquement. Utilisez l'onglet « Navigateur » pour visualiser la page complète du site.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Bottom Floating Info Banner */}
            <div className="bg-black/95 px-3 py-1.5 border-t border-white/10 flex items-center justify-between text-[0.65rem] font-mono text-text-muted shrink-0">
              <div className="flex items-center gap-3">
                <span>Routage : <strong className="text-neon-cyan">{proxyProvider}</strong></span>
                {searchPhone && (
                  <span>Cible active : <strong className="text-neon-green">{searchPhone}</strong></span>
                )}
              </div>
              <div className="hidden sm:block">
                HACK509 // MINI-NAVIGATEUR EMBARQUÉ SÉCURISÉ
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
        currentUrl={activeUrl}
        onImportSuccess={onImportSuccess}
      />
    </>
  )
}
