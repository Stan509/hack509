import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth, api } from '../contexts/AuthContext.jsx'
import { useDialer } from '../contexts/DialerContext.jsx'
import ContactCard from '../components/ContactCard.jsx'
import TPSGeneratorModal from '../components/TPSGeneratorModal.jsx'

const STATUS_COLORS = {
  new:          { label: 'NEW',         color: '#3b82f6' },
  answered:     { label: 'ANSWERED',    color: '#00ff66' },
  busy:         { label: 'BUSY',        color: '#ff9900' },
  voicemail:    { label: 'VOICEMAIL',   color: '#a855f7' },
  wrong_number: { label: 'WRONG #',    color: '#ff9900' },
  do_not_call:  { label: 'DNC',         color: '#ff2244' },
  no_answer:    { label: 'NO ANSWER',   color: '#6b7280' },
  callback:     { label: 'CALLBACK',    color: '#00d4ff' },
}

function ImportPipeline({ onImport }) {
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState([])
  const [parsed, setParsed] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState(false)

  const parseCSV = () => {
    setImportError('')
    const lines = csv.trim().split('\n').filter(Boolean)
    if (lines.length === 0) { setImportError('No data to parse'); return }

    const header = lines[0].toLowerCase().split(',').map((h) => h.trim())
    const results = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map((v) => v.trim().replace(/^["']|["']$/g, ''))
      const row = {}
      header.forEach((h, idx) => { row[h] = values[idx] || '' })

      // Normalize fields
      const contact = {
        id: `import_${Date.now()}_${i}`,
        first_name: row.first_name || row.firstname || row.first || '',
        last_name: row.last_name || row.lastname || row.last || '',
        phone: row.phone || row.phone_number || row.mobile || row.cell || '',
        address: row.address || row.addr || '',
        source: 'csv_import',
        status: 'new',
      }

      if (contact.phone) results.push(contact)
    }

    if (results.length === 0) {
      setImportError('No valid contacts found. Ensure "phone" column exists.')
      return
    }

    setPreview(results)
    setParsed(true)
  }

  const handleImport = async () => {
    setImporting(true)
    setImportError('')
    try {
      await onImport(preview)
      setImportSuccess(true)
      setCsv('')
      setPreview([])
      setParsed(false)
      setTimeout(() => setImportSuccess(false), 3000)
    } catch (err) {
      setImportError(err.message || 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="card-cyber rounded p-5">
      <div className="terminal-header mb-1">Data Ingestion</div>
      <h3 className="text-text-terminal text-sm font-mono font-bold mb-4">DATA EXTRACTION PIPELINE</h3>

      <div className="text-text-muted text-xs font-mono mb-2" style={{ fontSize: '0.65rem' }}>
        FORMAT: first_name,last_name,phone,address (CSV — first row is header)
      </div>

      {!parsed ? (
        <>
          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            className="input-cyber w-full px-3 py-3 text-xs rounded-sm resize-none scrollbar-cyber"
            rows={8}
            placeholder={'first_name,last_name,phone,address\nJohn,Doe,+15550001234,123 Main St\nJane,Smith,+15550005678,456 Oak Ave'}
          />
          {importError && (
            <div className="text-neon-danger text-xs font-mono mt-2">{importError}</div>
          )}
          <button
            onClick={parseCSV}
            disabled={!csv.trim()}
            className="btn-cyber mt-3 px-6 py-2 text-xs rounded-sm font-bold"
            style={{ opacity: !csv.trim() ? 0.4 : 1 }}
          >
            ⬡ PARSE DATA
          </button>
        </>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="text-neon-green text-xs font-mono mb-3">
              ✓ PARSED {preview.length} CONTACTS — REVIEW BEFORE IMPORT
            </div>
            <div className="max-h-48 overflow-y-auto scrollbar-cyber border border-neon-green border-opacity-10 rounded-sm">
              <table className="table-cyber w-full">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>NAME</th>
                    <th>PHONE</th>
                    <th>ADDRESS</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((c, i) => (
                    <tr key={i}>
                      <td className="text-text-muted">{i + 1}</td>
                      <td>{c.first_name} {c.last_name}</td>
                      <td className="text-neon-dim">{c.phone}</td>
                      <td className="text-text-muted">{c.address || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {importError && <div className="text-neon-danger text-xs font-mono mt-2">{importError}</div>}
            {importSuccess && (
              <div className="text-neon-green text-xs font-mono mt-2 flex items-center gap-2">
                ✓ IMPORT COMPLETE — {preview.length} CONTACTS LOADED
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button
                onClick={handleImport}
                disabled={importing}
                className="btn-cyber flex-1 py-2 text-xs rounded-sm font-bold"
              >
                {importing ? '⟳ IMPORTING...' : `⬆ CONFIRM IMPORT (${preview.length})`}
              </button>
              <button
                onClick={() => { setParsed(false); setPreview([]) }}
                className="btn-cyber btn-danger px-4 py-2 text-xs rounded-sm"
              >
                ✕
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}

function GeneratorPipeline({ onImport, onSaveAndQueue }) {
  const [areaCode, setAreaCode] = useState('305')
  const [countryCode, setCountryCode] = useState('+1')
  const [prefixName, setPrefixName] = useState('Client')
  const [count, setCount] = useState(10)
  const [generating, setGenerating] = useState(false)
  const [generatedList, setGeneratedList] = useState([])
  const [success, setSuccess] = useState(false)
  const [genError, setGenError] = useState('')

  const [enriching, setEnriching] = useState(false)
  const [enrichedData, setEnrichedData] = useState(null)
  const [enrichTab, setEnrichTab] = useState('found') // 'found' | 'not_found' | 'all'

  const generateContacts = () => {
    setGenError('')
    setEnrichedData(null)
    const cleanArea = areaCode.replace(/[^0-9]/g, '') || '305'
    const list = []
    const cleanCC = countryCode.trim() || '+1'

    for (let i = 1; i <= Math.min(count, 100); i++) {
      const random7 = Math.floor(1000000 + Math.random() * 9000000)
      const phone = `${cleanCC}${cleanArea}${random7}`
      
      list.push({
        id: `gen_${Date.now()}_${i}`,
        first_name: `${prefixName}`,
        last_name: `${i}`,
        phone: phone,
        address: `Area Code ${cleanArea}`,
        source: `generator_${cleanArea}`,
        status: 'new',
      })
    }

    setGeneratedList(list)
  }

  const handleBulkTPSLookup = async () => {
    if (generatedList.length === 0) return
    setEnriching(true)
    setGenError('')
    try {
      const phones = generatedList.map(c => c.phone)
      const res = await api.post('/api/contacts/tps-lookup/', { phones })
      if (res.data && res.data.success) {
        setEnrichedData(res.data)
      } else {
        setGenError(res.data?.message || 'Erreur lors de la recherche globale TPS/FPS')
      }
    } catch (err) {
      setGenError(err.response?.data?.message || err.message || 'Erreur de connexion au serveur de recherche')
    } finally {
      setEnriching(false)
    }
  }

  const handleSaveList = async (targetList) => {
    if (!targetList || targetList.length === 0) return
    setGenerating(true)
    setGenError('')
    try {
      const contactsToSave = targetList.map(item => ({
        first_name: item.first_name || 'Prospect',
        last_name: item.last_name || 'Lead',
        phone: item.phone || item.lookup_phone || '',
        address: item.address || `Area Code ${areaCode}`,
        source: item.source || `TPS/FPS_Generator_${areaCode}`,
        status: 'new',
        note: item.note || `Recherché via TPS/FPS.`
      }))

      await onImport(contactsToSave)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      setGeneratedList([])
      setEnrichedData(null)
    } catch (err) {
      setGenError(err.response?.data?.message || err.message || 'Erreur lors de la sauvegarde')
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveAndQueueList = async (targetList) => {
    if (!targetList || targetList.length === 0) return
    setGenerating(true)
    setGenError('')
    try {
      const contactsToSave = targetList.map(item => ({
        first_name: item.first_name || 'Prospect',
        last_name: item.last_name || 'Lead',
        phone: item.phone || item.lookup_phone || '',
        address: item.address || `Area Code ${areaCode}`,
        source: item.source || `TPS/FPS_Generator_${areaCode}`,
        status: 'new',
        note: item.note || `Recherché via TPS/FPS.`
      }))

      await onImport(contactsToSave)
      if (onSaveAndQueue) onSaveAndQueue(contactsToSave)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
      setGeneratedList([])
      setEnrichedData(null)
    } catch (err) {
      setGenError(err.response?.data?.message || err.message || 'Erreur lors de la sauvegarde')
    } finally {
      setGenerating(false)
    }
  }

  const displayedList = enrichedData
    ? (enrichTab === 'found' ? enrichedData.found : enrichTab === 'not_found' ? enrichedData.not_found : enrichedData.results)
    : generatedList

  return (
    <div className="card-cyber rounded p-5 border border-neon-cyan border-opacity-30 mb-4" style={{ background: 'rgba(0,212,255,0.02)' }}>
      <div className="terminal-header mb-1">Algorithmic Generator & Intelligence</div>
      <h3 className="text-neon-cyan text-sm font-mono font-bold mb-4">⚡ GENERATEUR DE CONTACTS ET ENRICHISSEMENT TPS / FPS</h3>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="text-text-muted text-xs font-mono mb-1 block">CODE PAYS:</label>
          <input
            type="text"
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
            className="input-cyber w-full px-3 py-1.5 text-xs rounded-sm"
            placeholder="+1"
          />
        </div>
        <div>
          <label className="text-text-muted text-xs font-mono mb-1 block font-bold text-neon-cyan">INDICATIF / AREA CODE:</label>
          <input
            type="text"
            value={areaCode}
            onChange={(e) => setAreaCode(e.target.value)}
            className="input-cyber w-full px-3 py-1.5 text-xs rounded-sm border-neon-cyan"
            placeholder="305"
          />
        </div>
        <div>
          <label className="text-text-muted text-xs font-mono mb-1 block">NOM PREFIXE:</label>
          <input
            type="text"
            value={prefixName}
            onChange={(e) => setPrefixName(e.target.value)}
            className="input-cyber w-full px-3 py-1.5 text-xs rounded-sm"
            placeholder="Client"
          />
        </div>
        <div>
          <label className="text-text-muted text-xs font-mono mb-1 block">QUANTITE (MAX 100):</label>
          <input
            type="number"
            min={1}
            max={100}
            value={count}
            onChange={(e) => setCount(parseInt(e.target.value) || 10)}
            className="input-cyber w-full px-3 py-1.5 text-xs rounded-sm"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
        <button
          onClick={generateContacts}
          className="btn-cyber px-5 py-2 text-xs rounded-sm font-bold"
          style={{ borderColor: '#00d4ff', color: '#00d4ff' }}
        >
          ⬡ GENERER PREVIEW ({count})
        </button>

        {generatedList.length > 0 && (
          <button
            onClick={handleBulkTPSLookup}
            disabled={enriching}
            className="btn-cyber px-5 py-2 text-xs rounded-sm font-bold flex items-center gap-2"
            style={{ borderColor: '#00ff66', color: '#00ff66', background: 'rgba(0,255,102,0.12)' }}
          >
            {enriching ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-neon-green border-t-transparent rounded-full animate-spin" />
                <span>RECHERCHE EN MASSE TPS / FPS...</span>
              </>
            ) : (
              <>
                <span>🔍 RECHERCHER ET ENRICHIR TOUTE LA LISTE ({generatedList.length})</span>
              </>
            )}
          </button>
        )}
      </div>

      {generatedList.length > 0 && (
        <div>
          {/* Header & Tabs if enriched */}
          {enrichedData ? (
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3 bg-black/60 p-2 rounded border border-white/10">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-white">RÉSULTATS DE LA RECHERCHE TPS / FPS:</span>
                <button
                  onClick={() => setEnrichTab('found')}
                  className={`px-3 py-1 text-xs font-mono font-bold rounded transition-all ${
                    enrichTab === 'found'
                      ? 'bg-neon-green/20 text-neon-green border border-neon-green/50'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  🟢 TROUVÉS ({enrichedData.found_count})
                </button>
                <button
                  onClick={() => setEnrichTab('not_found')}
                  className={`px-3 py-1 text-xs font-mono font-bold rounded transition-all ${
                    enrichTab === 'not_found'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/50'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  🔴 AUCUN RÉSULTAT ({enrichedData.not_found_count})
                </button>
                <button
                  onClick={() => setEnrichTab('all')}
                  className={`px-3 py-1 text-xs font-mono font-bold rounded transition-all ${
                    enrichTab === 'all'
                      ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  📊 TOUS ({enrichedData.total})
                </button>
              </div>

              <div className="text-[0.65rem] font-mono text-neon-green">
                ✓ Recherche système terminée pour {enrichedData.total} numéros.
              </div>
            </div>
          ) : (
            <div className="text-neon-cyan text-xs font-mono mb-2 flex items-center justify-between">
              <span>✓ {generatedList.length} CONTACTS GÉNÉRÉS — APERÇU</span>
            </div>
          )}

          {/* Table */}
          <div className="max-h-60 overflow-y-auto scrollbar-cyber border border-neon-cyan border-opacity-20 rounded-sm mb-3">
            <table className="table-cyber w-full">
              <thead>
                <tr>
                  <th>#</th>
                  <th>NOM EXTRAIT / STATUT</th>
                  <th>NUMÉRO TÉLÉPHONE</th>
                  <th>ADRESSE & OPÉRATEUR</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {displayedList.map((c, i) => {
                  const isFound = c.status === 'FOUND'
                  const isNotFound = c.status === 'NOT_FOUND'

                  return (
                    <tr key={i} className={isFound ? 'bg-neon-green/5' : isNotFound ? 'bg-red-500/5' : ''}>
                      <td className="text-text-muted">{i + 1}</td>
                      <td className="font-bold font-mono">
                        <div className="flex items-center gap-2">
                          <span>{c.first_name} {c.last_name}</span>
                          {isFound && (
                            <span className="bg-neon-green/20 text-neon-green text-[0.6rem] px-1.5 py-0.5 rounded border border-neon-green/40">
                              PROSPECT TPS/FPS
                            </span>
                          )}
                          {isNotFound && (
                            <span className="bg-red-500/20 text-red-400 text-[0.6rem] px-1.5 py-0.5 rounded border border-red-500/40">
                              NON TROUVÉ
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-neon-dim font-mono">{c.phone || c.lookup_phone}</td>
                      <td className="text-text-muted text-xs truncate max-w-xs">
                        <div>🏠 {c.address || 'Non spécifié'}</div>
                        {c.carrier && <div className="text-[0.65rem] text-yellow-400 font-mono">🏢 {c.carrier}</div>}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={() => {
                            setTpsInitialPhone(c.phone || c.lookup_phone || '')
                            setBrowserTarget({ phone: c.phone || c.lookup_phone, name: `${c.first_name || ''} ${c.last_name || ''}`.trim() })
                            setTpsModalOpen(true)
                          }}
                          className="text-xs font-mono px-2 py-0.5 rounded-sm border border-neon-cyan/50 text-neon-cyan hover:brightness-125 transition-all cursor-pointer flex items-center gap-1"
                          style={{ fontSize: '0.65rem' }}
                          title="Ouvrir la fiche de recherche approfondie TPS / FPS"
                        >
                          🌐 TPS / FPS
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2">
            {enrichedData ? (
              <>
                <button
                  onClick={() => handleSaveList(enrichedData.found)}
                  disabled={generating || enrichedData.found_count === 0}
                  className="btn-cyber flex-1 py-2 text-xs rounded-sm font-bold"
                  style={{ borderColor: '#00ff66', color: '#00ff66', background: 'rgba(0,255,102,0.12)' }}
                >
                  {generating ? '⟳ ENREGISTREMENT...' : `+ ENREGISTRER SEULEMENT LES TROUVÉS (${enrichedData.found_count})`}
                </button>
                <button
                  onClick={() => handleSaveList(enrichedData.results)}
                  disabled={generating}
                  className="btn-cyber flex-1 py-2 text-xs rounded-sm font-bold"
                  style={{ borderColor: '#00d4ff', color: '#00d4ff' }}
                >
                  {generating ? '⟳ ENREGISTREMENT...' : `💾 TOUT ENREGISTRER EN 1-CLICK (${enrichedData.total})`}
                </button>
                <button
                  onClick={() => handleSaveAndQueueList(enrichedData.results)}
                  disabled={generating}
                  className="btn-cyber flex-1 py-2 text-xs rounded-sm font-bold"
                  style={{ borderColor: '#ff9900', color: '#ff9900', background: 'rgba(255,153,0,0.12)' }}
                >
                  {generating ? '⟳ ENREGISTREMENT...' : `📞 TOUT ENVOYER AU DIALER (${enrichedData.total})`}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => handleSaveList(generatedList)}
                  disabled={generating}
                  className="btn-cyber flex-1 py-2 text-xs rounded-sm font-bold"
                  style={{ borderColor: '#00ff66', color: '#00ff66' }}
                >
                  {generating ? '⟳ ENREGISTREMENT...' : `💾 ENREGISTRER DB (${generatedList.length})`}
                </button>
                <button
                  onClick={() => handleSaveAndQueueList(generatedList)}
                  disabled={generating}
                  className="btn-cyber flex-1 py-2 text-xs rounded-sm font-bold"
                  style={{ borderColor: '#00d4ff', color: '#00d4ff', background: 'rgba(0,212,255,0.1)' }}
                >
                  {generating ? '⟳ ENREGISTREMENT...' : `⚡ ENREGISTRER & ENVOYER AU DIALER (${generatedList.length})`}
                </button>
              </>
            )}

            <button
              onClick={() => { setGeneratedList([]); setEnrichedData(null) }}
              className="btn-cyber btn-danger px-4 py-2 text-xs rounded-sm"
            >
              ✕ ANNULER
            </button>
          </div>
        </div>
      )}

      {genError && (
        <div className="text-neon-danger text-xs font-mono mt-2 flex items-center gap-2">
          ✕ {genError}
        </div>
      )}

      {success && (
        <div className="text-neon-green text-xs font-mono mt-2 flex items-center gap-2">
          ✓ CONTACTS AJOUTES AVEC SUCCES A LA BASE DE DONNEES !
        </div>
      )}
    </div>
  )
}

export default function Contacts() {
  const { api } = useAuth()
  const { addToQueue, addBulkToQueue, toggleFavoriteContact } = useDialer()

  const [contacts, setContacts] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [selectedContact, setSelectedContact] = useState(null)
  const [showImport, setShowImport] = useState(false)
  const [showGenerator, setShowGenerator] = useState(true)
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [browserTarget, setBrowserTarget] = useState(null)
  const [tpsModalOpen, setTpsModalOpen] = useState(false)
  const [tpsInitialPhone, setTpsInitialPhone] = useState('')
  const PAGE_SIZE = 20

  const toggleSelectAll = () => {
    if (selectedIds.size === contacts.length && contacts.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(contacts.map(c => c.id)))
    }
  }

  const toggleSelectOne = (id) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const handleQueueSelected = () => {
    const list = contacts.filter(c => selectedIds.has(c.id))
    addBulkToQueue(list)
    setSelectedIds(new Set())
  }

  const handleQueueAllPage = () => {
    addBulkToQueue(contacts)
  }

  const loadContacts = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page,
        page_size: PAGE_SIZE,
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(favoriteOnly && { is_favorite: 'true' }),
      })
      const res = await api.get(`/api/contacts/?${params}`)
      const data = res.data
      setContacts(data.results || data || [])
      setTotal(data.count || data.length || 0)
    } catch {
      setContacts([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadContacts()
  }, [page, search, statusFilter, favoriteOnly])

  const handleImport = async (contactsList) => {
    const res = await api.post('/api/contacts/import/', { contacts: contactsList })
    await loadContacts()
    return res.data
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="terminal-header mb-1">Database</div>
          <h1 className="text-xl font-mono font-bold" style={{ color: '#00ff66', textShadow: '0 0 10px #00ff66' }}>
            LEAD DATABASE
            <span className="ml-3 text-sm font-normal text-text-muted">
              [{total.toLocaleString()} CONTACTS]
            </span>
          </h1>
        </motion.div>
        <div className="flex gap-2">
          <button
            onClick={() => { setTpsInitialPhone(''); setTpsModalOpen(true) }}
            className="btn-cyber px-4 py-2 text-xs rounded-sm font-bold flex items-center gap-1.5"
            style={{ borderColor: '#00ff66', color: '#00ff66', background: 'rgba(0, 255, 102, 0.12)' }}
          >
            <span>⚡ RECHERCHE TPS / FPS</span>
          </button>
          <button
            onClick={() => { setShowGenerator(!showGenerator); if (!showGenerator) setShowImport(false) }}
            className="btn-cyber px-4 py-2 text-xs rounded-sm font-bold flex items-center gap-1"
            style={{ borderColor: '#00d4ff', color: '#00d4ff' }}
          >
            ⚡ GENERATEUR PAR INDICATIF
          </button>
          <button
            onClick={() => { setShowImport(!showImport); if (!showImport) setShowGenerator(false) }}
            className="btn-cyber px-4 py-2 text-xs rounded-sm font-bold"
            style={{ borderColor: '#00ff66', color: '#00ff66' }}
          >
            {showImport ? '✕ CLOSE' : '⬆ IMPORT CSV'}
          </button>
        </div>
      </div>

      {/* Generator Panel */}
      <AnimatePresence>
        {showGenerator && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <GeneratorPipeline onImport={handleImport} onSaveAndQueue={(list) => addBulkToQueue(list)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import Panel */}
      <AnimatePresence>
        {showImport && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <ImportPipeline onImport={handleImport} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="input-cyber w-full pl-8 pr-4 py-2 text-xs rounded-sm"
            placeholder="SEARCH CONTACTS..."
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="input-cyber px-3 py-2 text-xs rounded-sm"
          style={{ background: '#080808' }}
        >
          <option value="">ALL STATUS</option>
          {Object.entries(STATUS_COLORS).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>

        <button
          onClick={() => setFavoriteOnly(!favoriteOnly)}
          className="btn-cyber px-3 py-2 text-xs rounded-sm font-bold flex items-center gap-1"
          style={{
            borderColor: favoriteOnly ? '#ffcc00' : 'rgba(255,204,0,0.4)',
            color: favoriteOnly ? '#ffcc00' : '#888',
            background: favoriteOnly ? 'rgba(255,204,0,0.15)' : 'transparent',
          }}
        >
          {favoriteOnly ? '⭐ FAVORIS (ACTIF)' : '☆ FAVORIS'}
        </button>

        <button onClick={loadContacts} className="btn-cyber px-3 py-2 text-xs rounded-sm">
          ↻ REFRESH
        </button>
      </div>

      {/* Quick Phone Lookup Tool */}
      <div className="card-cyber rounded p-4 flex flex-wrap items-center justify-between gap-4 border border-neon-green border-opacity-20" style={{ background: 'rgba(0, 255, 102, 0.02)' }}>
        <div className="flex items-center gap-3 flex-1 min-w-64">
          <span className="text-neon-green font-mono text-xs font-bold whitespace-nowrap">⚡ RECHERCHE DANS LE SYSTÈME:</span>
          <input
            type="text"
            value={quickPhone}
            onChange={(e) => setQuickPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && quickPhone.trim()) {
                setTpsInitialPhone(quickPhone.trim())
                setTpsModalOpen(true)
              }
            }}
            placeholder="Entrez un numéro ou nom (ex: 3055550199)..."
            className="input-cyber px-3 py-1.5 text-xs rounded-sm flex-1 min-w-48"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setTpsInitialPhone(quickPhone.trim())
              setTpsModalOpen(true)
            }}
            className="btn-cyber px-4 py-1.5 text-xs rounded-sm font-bold flex items-center gap-1.5"
            style={{ borderColor: '#00ff66', color: '#00ff66' }}
          >
            <span>🔍 LANCER RECHERCHE TPS / FPS (IN-APP)</span>
          </button>
        </div>
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-cyber rounded overflow-hidden"
      >
        {/* Bulk Actions Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-bg-card border-b border-neon-green border-opacity-10">
          <div className="flex items-center gap-2">
            <button
              onClick={handleQueueAllPage}
              disabled={contacts.length === 0}
              className="btn-cyber px-3 py-1.5 text-xs rounded-sm font-bold flex items-center gap-1 hover:brightness-125"
              style={{ borderColor: '#00ff66', color: '#00ff66', opacity: contacts.length === 0 ? 0.4 : 1 }}
            >
              + ENVOYER TOUT AU DIALER ({contacts.length})
            </button>

            {selectedIds.size > 0 && (
              <button
                onClick={handleQueueSelected}
                className="btn-cyber px-3 py-1.5 text-xs rounded-sm font-bold flex items-center gap-1 hover:brightness-125"
                style={{ borderColor: '#00d4ff', color: '#00d4ff', background: 'rgba(0,212,255,0.1)' }}
              >
                + ENVOYER LA SELECTION AU DIALER ({selectedIds.size})
              </button>
            )}
          </div>

          <div className="text-text-muted text-xs font-mono">
            {selectedIds.size} / {contacts.length} SELECTIONNE(S)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table-cyber">
            <thead>
              <tr>
                <th className="w-8 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === contacts.length && contacts.length > 0}
                    onChange={toggleSelectAll}
                    className="cursor-pointer accent-neon-green"
                  />
                </th>
                <th>NAME</th>
                <th>PHONE</th>
                <th>ADDRESS</th>
                <th>SOURCE</th>
                <th>STATUS</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <motion.div
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="text-neon-green font-mono text-sm"
                    >
                      ◎ LOADING DATABASE...
                    </motion.div>
                  </td>
                </tr>
              ) : contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-text-muted text-xs font-mono">
                    NO CONTACTS FOUND — {search ? 'TRY DIFFERENT SEARCH' : 'IMPORT LEADS TO BEGIN'}
                  </td>
                </tr>
              ) : (
                contacts.map((contact, i) => {
                  const statusCfg = STATUS_COLORS[contact.status] || { label: 'UNKNOWN', color: '#3d5a3d' }
                  const isChecked = selectedIds.has(contact.id)
                  return (
                    <motion.tr
                      key={contact.id || i}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className={`group cursor-pointer ${isChecked ? 'bg-neon-green bg-opacity-5' : ''}`}
                    >
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleSelectOne(contact.id)}
                          className="cursor-pointer accent-neon-green"
                        />
                      </td>
                      <td className="group-hover:text-neon-green transition-colors">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFavoriteContact(contact); }}
                            className="text-xs font-mono text-yellow-400 opacity-60 hover:opacity-100 transition-opacity"
                            title={contact.is_favorite ? "Retirer des favoris" : "Marquer comme favori"}
                          >
                            {contact.is_favorite ? '⭐' : '☆'}
                          </button>
                          <span className="font-semibold">{contact.first_name} {contact.last_name}</span>
                        </div>
                      </td>
                      <td className="text-neon-dim">{contact.phone}</td>
                      <td className="text-text-muted">{contact.address || '--'}</td>
                      <td className="text-text-muted" style={{ fontSize: '0.65rem', letterSpacing: '0.05em' }}>
                        {contact.source?.toUpperCase() || '--'}
                      </td>
                      <td>
                        <span
                          className="badge-cyber rounded-sm"
                          style={{ color: statusCfg.color, background: `${statusCfg.color}18`, border: `1px solid ${statusCfg.color}44` }}
                        >
                          {statusCfg.label}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); addToQueue(contact); }}
                            className="text-xs font-mono text-neon-dim hover:text-neon-green transition-colors px-2 py-1 rounded-sm hover:bg-neon-green hover:bg-opacity-10"
                          >
                            +QUEUE
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setSelectedContact(contact); }}
                            className="text-xs font-mono text-text-muted hover:text-neon-green transition-colors px-2 py-1 rounded-sm"
                          >
                            VIEW
                          </button>
                          {contact.phone && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setTpsInitialPhone(contact.phone || '')
                                  setBrowserTarget({ phone: contact.phone, name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim() })
                                  setTpsModalOpen(true)
                                }}
                                className="text-xs font-mono px-2 py-0.5 rounded-sm border border-neon-cyan/50 text-neon-cyan hover:brightness-125 transition-all cursor-pointer"
                                style={{ fontSize: '0.65rem' }}
                                title="Ouvrir la fiche de recherche système TPS / FPS"
                              >
                                🌐 TPS / FPS
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neon-green border-opacity-10">
            <div className="text-text-muted text-xs font-mono">
              PAGE {page} / {totalPages} — {total} TOTAL
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-cyber px-3 py-1 text-xs rounded-sm"
                style={{ opacity: page === 1 ? 0.4 : 1 }}
              >
                ← PREV
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-cyber px-3 py-1 text-xs rounded-sm"
                style={{ opacity: page === totalPages ? 0.4 : 1 }}
              >
                NEXT →
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Contact Detail Modal */}
      <AnimatePresence>
        {selectedContact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: 'rgba(0,0,0,0.8)' }}
            onClick={(e) => e.target === e.currentTarget && setSelectedContact(null)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="card-cyber rounded p-6 w-full max-w-md mx-4"
              style={{ border: '1px solid rgba(0,255,102,0.3)', boxShadow: '0 0 40px rgba(0,255,102,0.1)' }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-neon-green font-mono font-bold">CONTACT DETAILS</h3>
                <button onClick={() => setSelectedContact(null)} className="text-text-muted hover:text-neon-danger font-mono">✕</button>
              </div>
              <ContactCard contact={selectedContact} onAddToQueue={(c) => { addToQueue(c); setSelectedContact(null) }} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TPS / FPS Generator & Search Modal */}
      <TPSGeneratorModal
        isOpen={tpsModalOpen || Boolean(browserTarget)}
        onClose={() => {
          setTpsModalOpen(false)
          setBrowserTarget(null)
        }}
        initialPhone={tpsInitialPhone || browserTarget?.phone || ''}
        contactName={browserTarget?.name || ''}
        onAddToQueue={(c) => addToQueue(c)}
        onContactSaved={() => loadContacts()}
      />
    </div>
  )
}

