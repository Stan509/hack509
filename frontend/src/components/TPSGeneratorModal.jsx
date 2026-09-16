import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../contexts/AuthContext.jsx'

export default function TPSGeneratorModal({ isOpen, onClose, initialPhone = '', contactName = '', onAddToQueue, onContactSaved }) {
  const [searchTab, setSearchTab] = useState('phone') // 'phone' | 'name' | 'address'
  const [provider, setProvider] = useState('all') // 'all' | 'tps' | 'fps'
  
  const [phone, setPhone] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [cityState, setCityState] = useState('')
  const [address, setAddress] = useState('')

  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [savingId, setSavingId] = useState(null)
  const [savedSuccessMap, setSavedSuccessMap] = useState({})

  useEffect(() => {
    if (isOpen) {
      if (initialPhone) {
        setPhone(initialPhone)
        setSearchTab('phone')
        // Automatically trigger lookup if phone is passed
        handleLookup('phone', { phone: initialPhone }, provider)
      } else if (contactName) {
        const parts = contactName.trim().split(' ')
        if (parts.length >= 2) {
          setFirstName(parts[0])
          setLastName(parts.slice(1).join(' '))
          setSearchTab('name')
        }
      }
    }
  }, [isOpen, initialPhone, contactName])

  const handleLookup = async (tabOverride, queryOverride, providerOverride) => {
    setLoading(true)
    setError(null)
    setResults(null)

    let activeTab = tabOverride || searchTab
    const activeProvider = providerOverride || provider
    let queryData = {}

    let pVal = queryOverride?.phone || phone
    let fNameVal = firstName
    let lNameVal = lastName

    if (activeTab === 'phone') {
      if (!pVal) {
        setError('Veuillez entrer un numéro ou un nom à rechercher.')
        setLoading(false)
        return
      }
      // If user typed letters in phone field (e.g. "georges"), fallback to name search
      if (!anyDigit(pVal)) {
        activeTab = 'name'
        fNameVal = pVal
        queryData = { first_name: pVal }
      } else {
        queryData = { phone: pVal }
      }
    } else if (activeTab === 'name') {
      if (!fNameVal && !lNameVal) {
        setError('Veuillez entrer au moins un prénom ou nom.')
        setLoading(false)
        return
      }
      queryData = { first_name: fNameVal, last_name: lNameVal, city_state: cityState }
    } else if (activeTab === 'address') {
      if (!address) {
        setError('Veuillez entrer une adresse.')
        setLoading(false)
        return
      }
      queryData = { street: address, city_state: cityState }
    }

    try {
      const resp = await api.post('/api/contacts/tps-lookup/', {
        search_type: activeTab,
        provider: activeProvider,
        phone: pVal,
        name: `${fNameVal || ''} ${lNameVal || ''}`.trim(),
        first_name: fNameVal,
        last_name: lNameVal,
        location: cityState || address,
        query: queryData,
      })
      if (resp.data && resp.data.success) {
        setResults(resp.data.results || [])
      } else {
        setError(resp.data.message || 'Erreur lors de la recherche TPS/FPS.')
      }
    } catch (err) {
      console.error('TPS/FPS Lookup Error:', err)
      setError(err.response?.data?.message || err.message || 'Erreur de connexion au serveur de recherche.')
    } finally {
      setLoading(false)
    }
  }

  const anyDigit = (str) => str && /[0-9]/.test(str)

  const handleSaveContact = async (leadIndex, lead) => {
    setSavingId(leadIndex)
    try {
      const relativesText = Array.isArray(lead.relatives)
        ? lead.relatives.join(', ')
        : (typeof lead.relatives === 'string' ? lead.relatives : 'N/A')

      const newContact = {
        first_name: lead.first_name || 'Contact',
        last_name: lead.last_name || 'TPS/FPS',
        phone: lead.phone || '',
        address: lead.address || '',
        city: lead.city || '',
        state: lead.state || '',
        note: `Ajouté depuis ${lead.source || 'TPS/FPS'}. Âge: ${lead.age || 'N/A'}. Proches: ${relativesText}`
      }
      
      const res = await api.post('/api/contacts/', newContact)
      setSavedSuccessMap(prev => ({ ...prev, [leadIndex]: true }))
      if (onContactSaved) onContactSaved(res.data)
    } catch (err) {
      console.error('Save contact error:', err)
      alert('Erreur lors de l\'enregistrement du contact: ' + (err.response?.data?.detail || err.message))
    } finally {
      setSavingId(null)
    }
  }

  const handleQueueCall = (lead) => {
    if (onAddToQueue) {
      onAddToQueue({
        first_name: lead.first_name,
        last_name: lead.last_name,
        phone: lead.phone,
        address: lead.address,
      })
    }
  }

  const handleAddAllToQueue = () => {
    if (!results || results.length === 0) return
    const validLeads = results.filter(l => l.phone)
    if (validLeads.length === 0) {
      alert('Aucun numéro valide à ajouter au Dialer.')
      return
    }
    if (onAddToQueue) {
      validLeads.forEach(lead => {
        onAddToQueue({
          first_name: lead.first_name,
          last_name: lead.last_name,
          phone: lead.phone,
          address: lead.address,
        })
      })
    }
    alert(`✓ ${validLeads.length} contact(s) ajoutés au Dialer avec succès !`)
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0, 0, 0, 0.88)', backdropFilter: 'blur(8px)' }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="card-cyber w-full max-w-5xl h-[88vh] flex flex-col rounded overflow-hidden shadow-2xl"
          style={{ border: '1px solid rgba(0, 255, 102, 0.4)', boxShadow: '0 0 50px rgba(0, 255, 102, 0.15)' }}
        >
          {/* Header */}
          <div className="bg-black/90 px-5 py-3 border-b border-neon-green/30 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onClose}
                  className="w-3.5 h-3.5 rounded-full bg-red-500 hover:brightness-125 transition-all"
                  title="Fermer"
                />
                <div className="w-3.5 h-3.5 rounded-full bg-yellow-500 opacity-60" />
                <div className="w-3.5 h-3.5 rounded-full bg-green-500 opacity-60" />
              </div>
              <div className="h-4 w-px bg-white/20" />
              <div className="terminal-header flex items-center gap-2 text-sm font-bold tracking-wide">
                <span>⚡ GÉNÉRATEUR & RECHERCHE TPS / FPS (INTEGRÉ)</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-neon-green/10 border border-neon-green/40 text-neon-green text-xs font-mono font-semibold">
                <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                <span>🌐 PROXY / VPN USA : ACCÈS INTERNET OK</span>
              </div>
              <button
                onClick={onClose}
                className="text-text-muted hover:text-neon-danger text-sm font-mono px-2 py-0.5"
              >
                ✕ FERMER
              </button>
            </div>
          </div>

          {/* Search Controls Bar */}
          <div className="bg-black/80 p-4 border-b border-white/10 flex flex-col gap-3 flex-shrink-0">
            {/* Tabs & Source Selector */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 bg-black/60 p-1 rounded border border-white/10">
                <button
                  onClick={() => setSearchTab('phone')}
                  className={`px-3 py-1.5 text-xs font-mono font-bold rounded transition-all flex items-center gap-1.5 ${
                    searchTab === 'phone'
                      ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  <span>📞 Par Numéro</span>
                </button>
                <button
                  onClick={() => setSearchTab('name')}
                  className={`px-3 py-1.5 text-xs font-mono font-bold rounded transition-all flex items-center gap-1.5 ${
                    searchTab === 'name'
                      ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  <span>👤 Par Nom & Localisation</span>
                </button>
                <button
                  onClick={() => setSearchTab('address')}
                  className={`px-3 py-1.5 text-xs font-mono font-bold rounded transition-all flex items-center gap-1.5 ${
                    searchTab === 'address'
                      ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  <span>🏠 Par Adresse</span>
                </button>
              </div>

              {/* Provider Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-text-muted">Source :</span>
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="bg-black/90 border border-neon-green/40 rounded px-3 py-1 text-xs font-mono text-neon-green focus:outline-none focus:border-neon-green"
                >
                  <option value="all">🔍 Tous (TPS + FPS)</option>
                  <option value="tps">🔎 TruePeopleSearch</option>
                  <option value="fps">⚡ FastPeopleSearch</option>
                </select>
              </div>
            </div>

            {/* Inputs based on Search Tab */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
              {searchTab === 'phone' && (
                <div className="md:col-span-3">
                  <input
                    type="text"
                    placeholder="Entrez le numéro de téléphone (ex: 800-555-0199 ou 18295098412)..."
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                    className="w-full bg-black/90 border border-white/20 rounded px-3.5 py-2 text-sm font-mono text-white placeholder-text-muted focus:border-neon-cyan focus:outline-none"
                  />
                </div>
              )}

              {searchTab === 'name' && (
                <>
                  <input
                    type="text"
                    placeholder="Prénom (First Name)..."
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="bg-black/90 border border-white/20 rounded px-3 py-2 text-sm font-mono text-white placeholder-text-muted focus:border-neon-cyan focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Nom (Last Name)..."
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="bg-black/90 border border-white/20 rounded px-3 py-2 text-sm font-mono text-white placeholder-text-muted focus:border-neon-cyan focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Ville, État ou Zip (ex: Miami, FL)..."
                    value={cityState}
                    onChange={(e) => setCityState(e.target.value)}
                    className="bg-black/90 border border-white/20 rounded px-3 py-2 text-sm font-mono text-white placeholder-text-muted focus:border-neon-cyan focus:outline-none"
                  />
                </>
              )}

              {searchTab === 'address' && (
                <>
                  <input
                    type="text"
                    placeholder="Adresse Rue (ex: 123 Main St)..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="md:col-span-2 bg-black/90 border border-white/20 rounded px-3 py-2 text-sm font-mono text-white placeholder-text-muted focus:border-neon-cyan focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Ville, État (ex: New York, NY)..."
                    value={cityState}
                    onChange={(e) => setCityState(e.target.value)}
                    className="bg-black/90 border border-white/20 rounded px-3 py-2 text-sm font-mono text-white placeholder-text-muted focus:border-neon-cyan focus:outline-none"
                  />
                </>
              )}

              <button
                onClick={() => handleLookup()}
                disabled={loading}
                className="btn-cyber w-full py-2 text-xs font-bold font-mono border-neon-green text-neon-green hover:bg-neon-green/20 rounded flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-neon-green border-t-transparent rounded-full animate-spin" />
                    <span>RECHERCHE...</span>
                  </>
                ) : (
                  <>
                    <span>⚡ RECHERCHER DANS LE SYSTÈME</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Results Area */}
          <div className="flex-1 bg-black/95 overflow-y-auto p-5 space-y-4">
            {error && (
              <div className="bg-red-500/10 border border-red-500/40 p-4 rounded text-red-400 font-mono text-sm flex items-center gap-3">
                <span className="text-xl">⚠️</span>
                <div>{error}</div>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center h-64 space-y-3">
                <div className="w-10 h-10 border-3 border-neon-green border-t-transparent rounded-full animate-spin" />
                <div className="text-neon-green font-mono text-xs tracking-wider animate-pulse">
                  RECHERCHE ET GÉNÉRATION DE RÉSULTATS VIA PROXY TPS / FPS EN COURS...
                </div>
              </div>
            )}

            {!loading && !error && results === null && (
              <div className="flex flex-col items-center justify-center h-64 text-center space-y-2 text-text-muted font-mono">
                <div className="text-4xl opacity-50">🔍</div>
                <div className="text-sm font-semibold">AUCUNE RECHERCHE EFFECTUÉE</div>
                <div className="text-xs max-w-md">
                  Lancez une recherche par numéro, nom ou adresse pour extraire et enregistrer directement des contacts TPS/FPS dans votre système.
                </div>
              </div>
            )}

            {!loading && !error && results && results.length === 0 && (
              <div className="flex flex-col items-center justify-center h-64 text-center space-y-2 text-neon-warn font-mono">
                <div className="text-4xl">📭</div>
                <div className="text-sm font-bold">AUCUN RÉSULTAT TROUVÉ</div>
                <div className="text-xs text-text-muted max-w-md">
                  Aucun dossier correspondant dans les bases TPS/FPS. Vérifiez l'orthographe ou le format du numéro.
                </div>
              </div>
            )}

            {!loading && results && results.length > 0 && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                  <span className="text-xs font-mono font-bold text-neon-green">
                    📊 {results.length} RÉSULTAT(S) EXTRAIT(S) DU SYSTÈME
                  </span>
                  <button
                    onClick={handleAddAllToQueue}
                    className="px-3 py-1.5 text-xs font-mono font-bold bg-neon-cyan/20 hover:bg-neon-cyan/35 border border-neon-cyan text-neon-cyan rounded flex items-center gap-1.5 transition-all shadow-lg hover:shadow-neon-cyan/20"
                  >
                    <span>📞 AJOUTER TOUS LES RÉSULTATS AU DIALER ({results.filter(r => r.phone).length})</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {results.map((lead, idx) => {
                    const isSaved = savedSuccessMap[idx]
                    const isSaving = savingId === idx

                    return (
                      <div
                        key={idx}
                        className="bg-black/80 border border-white/15 hover:border-neon-cyan/50 p-4 rounded-lg flex flex-col md:flex-row items-start justify-between gap-4 transition-all shadow-md"
                      >
                        {/* Info Left */}
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-lg font-mono font-bold text-white">
                              {lead.first_name} {lead.last_name}
                            </span>
                            {lead.age && (
                              <span className="bg-white/10 border border-white/20 text-white/80 text-[0.65rem] font-mono px-2 py-0.5 rounded">
                                Âge: {lead.age}
                              </span>
                            )}
                            <span className="bg-neon-cyan/10 border border-neon-cyan/40 text-neon-cyan text-[0.65rem] font-mono px-2 py-0.5 rounded font-semibold">
                              {lead.source}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-text-muted">
                            <div className="flex items-center gap-1.5">
                              <span className="text-neon-green font-bold">📞 Téléphone:</span>
                              <span className="text-white font-semibold">{lead.phone || 'Non spécifié'}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-neon-cyan font-bold">🏠 Adresse:</span>
                              <span className="text-white/90 truncate">{lead.address || 'Non disponible'}</span>
                            </div>
                          </div>

                          {lead.relatives && (
                            <div className="text-[0.7rem] font-mono text-text-muted flex flex-wrap items-center gap-1">
                              <span className="text-yellow-400 font-bold">Proches associés:</span>
                              {Array.isArray(lead.relatives) ? (
                                lead.relatives.map((rel, rIdx) => (
                                  <span key={rIdx} className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-white/80">
                                    {rel}
                                  </span>
                                ))
                              ) : (
                                <span className="bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-white/80">
                                  {String(lead.relatives)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Actions Right */}
                        <div className="flex flex-wrap md:flex-col items-stretch gap-2 min-w-[200px]">
                          <button
                            onClick={() => handleSaveContact(idx, lead)}
                            disabled={isSaving || isSaved}
                            className={`px-3 py-2 text-xs font-mono font-bold rounded flex items-center justify-center gap-1.5 transition-all ${
                              isSaved
                                ? 'bg-neon-green/20 border border-neon-green text-neon-green'
                                : 'bg-neon-green/10 hover:bg-neon-green/25 border border-neon-green/50 text-neon-green'
                            }`}
                          >
                            {isSaving ? (
                              <span>ENREGISTREMENT...</span>
                            ) : isSaved ? (
                              <span>✓ ENREGISTRÉ DANS CONTACTS</span>
                            ) : (
                              <span>+ ENREGISTRER CONTACT</span>
                            )}
                          </button>

                          {lead.phone && (
                            <button
                              onClick={() => handleQueueCall(lead)}
                              className="px-3 py-2 text-xs font-mono font-bold bg-neon-cyan/10 hover:bg-neon-cyan/25 border border-neon-cyan/50 text-neon-cyan rounded flex items-center justify-center gap-1.5 transition-all"
                            >
                              <span>📞 AJOUTER AU DIALER</span>
                            </button>
                          )}

                          {lead.direct_link && (
                            <a
                              href={lead.direct_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 text-[0.65rem] font-mono text-center text-text-muted hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded transition-all"
                            >
                              ↗ Voir source externe
                            </a>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
