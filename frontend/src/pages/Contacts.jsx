import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth, api } from '../contexts/AuthContext.jsx'
import { useDialer } from '../contexts/DialerContext.jsx'
import ContactCard from '../components/ContactCard.jsx'
import EmbeddedBrowserModal from '../components/EmbeddedBrowserModal.jsx'

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

function ImportPipeline({ onImport, onSaveAndQueue }) {
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState('')
  const [preview, setPreview] = useState([])
  const [parsed, setParsed] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState('')
  const [importSuccess, setImportSuccess] = useState('')
  const [useTextInput, setUseTextInput] = useState(false)
  const fileInputRef = useRef(null)

  // Smart CSV line tokenizer handling quotes
  const tokenizeCSVLine = (line, delimiter) => {
    const values = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = !inQuotes
        }
      } else if (char === delimiter && !inQuotes) {
        values.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
    values.push(current.trim())
    return values.map(v => v.replace(/^["']|["']$/g, '').trim())
  }

  // Detect dominant delimiter (, ; \t |)
  const detectDelimiter = (sampleLine) => {
    const delimiters = [',', ';', '\t', '|']
    let bestDelim = ','
    let maxCount = 0
    delimiters.forEach(d => {
      const count = sampleLine.split(d).length - 1
      if (count > maxCount) {
        maxCount = count
        bestDelim = d
      }
    })
    return bestDelim
  }

  const parseRawCSV = (content) => {
    setImportError('')
    setImportSuccess('')
    if (!content || !content.trim()) {
      setImportError('Veuillez sélectionner ou coller un fichier CSV.')
      return
    }

    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim().length > 0)
    if (lines.length === 0) {
      setImportError('Le fichier est vide.')
      return
    }

    const delimiter = detectDelimiter(lines[0])
    const rawHeader = tokenizeCSVLine(lines[0], delimiter)
    const lowerHeader = rawHeader.map(h => h.toLowerCase())

    // Check if first line is a header or already data
    const firstLineHasPhone = rawHeader.some(val => {
      const digits = val.replace(/\D/g, '')
      return digits.length >= 7 && digits.length <= 15
    })
    const isHeaderPresent = !firstLineHasPhone && rawHeader.some(h => /name|nom|prenom|phone|tel|mobile|cell|num|addr|mail|contact/i.test(h))

    const startIndex = isHeaderPresent ? 1 : 0
    const headerCols = isHeaderPresent ? lowerHeader : rawHeader.map((_, i) => `col_${i}`)

    // Find known column indices
    let phoneColIdx = headerCols.findIndex(h => /phone|tel|mobile|cell|num|contact|appel/i.test(h))
    const fnameColIdx = headerCols.findIndex(h => /first_name|firstname|prenom|first|given/i.test(h) && !/reported/i.test(h))
    const lnameColIdx = headerCols.findIndex(h => /last_name|lastname|nom|last|family|surname/i.test(h))
    const fullNameColIdx = headerCols.findIndex(h => /^(name|full_name|fullname|nom_complet|contact_name|client|prospect)$/i.test(h))
    const addrColIdx = headerCols.findIndex(h => /address|addr|street|rue|adresse|location/i.test(h))
    const cityColIdx = headerCols.findIndex(h => /city|ville/i.test(h))
    const stateColIdx = headerCols.findIndex(h => /state|etat|region/i.test(h))
    const compColIdx = headerCols.findIndex(h => /company|societe|entreprise|carrier|carrier_name|operator/i.test(h))
    const notesColIdx = headerCols.findIndex(h => /note|notes|remarque|comment|email|mail/i.test(h))
    const typeColIdx = headerCols.findIndex(h => /^type$|^category$|^line_?type$/i.test(h))
    const reportedColIdx = headerCols.findIndex(h => /reported|first_seen|first seen|date_added|date added/i.test(h))

    const results = []

    for (let i = startIndex; i < lines.length; i++) {
      const values = tokenizeCSVLine(lines[i], delimiter)
      if (values.length === 0 || values.every(v => !v)) continue

      // If phone column wasn't identified by header, detect by value
      let phoneVal = phoneColIdx >= 0 ? values[phoneColIdx] : ''
      if (!phoneVal) {
        for (let c = 0; c < values.length; c++) {
          const digits = values[c].replace(/\D/g, '')
          if (digits.length >= 7 && digits.length <= 15) {
            phoneVal = values[c]
            if (phoneColIdx < 0) phoneColIdx = c // Lock in column
            break
          }
        }
      }

      if (!phoneVal) continue

      // Normalize phone E.164
      const digits = phoneVal.replace(/\D/g, '')
      let cleanPhone = ''
      if (digits.length === 10) {
        cleanPhone = '+1' + digits
      } else if (digits.length === 11 && digits.startsWith('1')) {
        cleanPhone = '+' + digits
      } else if (phoneVal.startsWith('+')) {
        cleanPhone = '+' + digits
      } else {
        cleanPhone = digits.length >= 7 ? '+' + digits : phoneVal
      }

      // Detect Names.
      // When the file exposes a single "Name" column (e.g. the format
      // Name,City,State,Phone,Type,Carrier,First Reported) we keep that value
      // whole as the contact full name instead of splitting it, so the imported
      // name is exactly the "Name" column value.
      let fname = fnameColIdx >= 0 ? values[fnameColIdx] : ''
      let lname = lnameColIdx >= 0 ? values[lnameColIdx] : ''
      const fullName = fullNameColIdx >= 0 ? values[fullNameColIdx] : ''

      if (!fname && !lname) {
        fname = fullName || `Prospect ${i + 1}`
        lname = ''
      } else if (!fname) {
        fname = fullName || `Prospect ${i + 1}`
      }

      // Detect Address & City/State
      let addr = addrColIdx >= 0 ? values[addrColIdx] : ''
      const city = cityColIdx >= 0 ? values[cityColIdx] : ''
      const state = stateColIdx >= 0 ? values[stateColIdx] : ''
      if (city || state) {
        const loc = [city, state].filter(Boolean).join(', ')
        addr = addr ? `${addr} (${loc})` : loc
      }

      const company = compColIdx >= 0 ? values[compColIdx] : ''
      const lineType = typeColIdx >= 0 ? values[typeColIdx] : ''
      const firstReported = reportedColIdx >= 0 ? values[reportedColIdx] : ''
      const rawNotes = notesColIdx >= 0 ? values[notesColIdx] : ''

      // Preserve the extra columns (Carrier / Type / First Reported) in the notes
      const noteParts = []
      if (company) noteParts.push(`Carrier: ${company}`)
      if (lineType) noteParts.push(`Type: ${lineType}`)
      if (firstReported) noteParts.push(`First reported: ${firstReported}`)
      if (rawNotes) noteParts.push(rawNotes)
      const notes = noteParts.join(' | ') || 'Import CSV'

      results.push({
        id: `import_${Date.now()}_${i}`,
        first_name: fname,
        last_name: lname,
        phone: cleanPhone,
        address: addr || 'Non spécifiée',
        company: company,
        notes: notes,
        source: fileName ? `csv:${fileName}` : 'csv_import',
        status: 'new',
      })
    }

    if (results.length === 0) {
      setImportError('Aucun contact valide avec un numéro de téléphone n’a été identifié. Vérifiez que votre fichier contient une colonne avec des numéros de téléphone.')
      return
    }

    setPreview(results)
    setParsed(true)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result || ''
      setCsvText(content)
      parseRawCSV(content)
    }
    reader.onerror = () => {
      setImportError('Erreur de lecture du fichier.')
    }
    reader.readAsText(file)
  }

  const handleImportSubmit = async (autoQueue = false) => {
    setImporting(true)
    setImportError('')
    try {
      await onImport(preview)
      if (autoQueue && onSaveAndQueue) {
        onSaveAndQueue(preview)
      }
      setImportSuccess(`✓ Succès : ${preview.length} contact(s) importé(s) dans la base !`)
      setTimeout(() => {
        setImportSuccess('')
        setParsed(false)
        setPreview([])
        setCsvText('')
        setFileName('')
      }, 3500)
    } catch (err) {
      setImportError(err.response?.data?.message || err.message || 'Échec de l’importation.')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="card-cyber rounded p-4 sm:p-5 border border-neon-green/30 bg-black/80 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="terminal-header text-[0.65rem] text-neon-green">INGESTION DE DONNÉES & FICHIERS</div>
          <h3 className="text-white text-sm font-mono font-bold">IMPORTATEUR DE CONTACTS CSV</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setUseTextInput(!useTextInput)}
            className="text-[0.7rem] font-mono px-2.5 py-1 rounded border border-white/20 text-text-muted hover:text-white"
          >
            {useTextInput ? '📁 Utiliser le sélecteur de fichier' : '✍️ Coller du texte brut'}
          </button>
        </div>
      </div>

      {!parsed ? (
        <div className="space-y-3">
          {!useTextInput ? (
            /* File Upload Drag & Drop Zone */
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) {
                  setFileName(file.name)
                  const reader = new FileReader()
                  reader.onload = (evt) => {
                    const content = evt.target?.result || ''
                    setCsvText(content)
                    parseRawCSV(content)
                  }
                  reader.readAsText(file)
                }
              }}
              className="border-2 border-dashed border-neon-green/40 hover:border-neon-green bg-black/40 hover:bg-neon-green/5 p-6 rounded-lg text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="text-3xl text-neon-green">📁</div>
              <div className="text-xs font-mono font-bold text-white">
                Cliquez pour choisir un fichier CSV ou Glissez-déposez ici
              </div>
              <div className="text-[0.7rem] font-mono text-text-muted">
                Colonnes reconnues : Name, City, State, Phone, Type, Carrier, First Reported — séparateurs (, ; \t |) détectés automatiquement
              </div>
              {fileName && (
                <div className="mt-2 px-3 py-1 rounded bg-neon-green/20 border border-neon-green text-neon-green text-xs font-mono font-bold">
                  Fichier sélectionné : {fileName}
                </div>
              )}
            </div>
          ) : (
            /* Textarea Input */
            <div>
              <textarea
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                className="input-cyber w-full px-3 py-3 text-xs rounded resize-none scrollbar-cyber bg-black/60 border border-white/20 text-white font-mono"
                rows={6}
                placeholder={"Name,City,State,Phone,Type,Carrier,First Reported\nJohnny Cash,Miami,FL,+13055551234,Mobile,Verizon Wireless,2019-01-15\nMarie Curie,New York,NY,+12125559876,Landline,AT&T,2011-05-02"}
              />
              <button
                type="button"
                onClick={() => parseRawCSV(csvText)}
                disabled={!csvText.trim()}
                className="btn-cyber mt-2 px-5 py-2 text-xs rounded font-bold cursor-pointer"
                style={{ opacity: !csvText.trim() ? 0.4 : 1 }}
              >
                ⬡ ANALYSER ET CLASSER LES CONTACTS
              </button>
            </div>
          )}

          {importError && (
            <div className="text-neon-danger text-xs font-mono bg-red-500/10 border border-red-500/30 p-2.5 rounded">
              ⚠️ {importError}
            </div>
          )}
        </div>
      ) : (
        /* Preview Table Before Import */
        <AnimatePresence mode="wait">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-neon-green text-xs font-mono font-bold flex items-center gap-1.5">
                <span>✓</span>
                <span>{preview.length} CONTACTS RECONNUS ET CLASSIFIÉS AVEC SUCCÈS</span>
              </div>
              <button
                type="button"
                onClick={() => { setParsed(false); setPreview([]); setFileName('') }}
                className="text-[0.7rem] font-mono text-text-muted hover:text-white px-2 py-0.5 rounded border border-white/20"
              >
                Changer de fichier
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto scrollbar-cyber border border-neon-green/30 rounded bg-black/60">
              <table className="table-cyber w-full text-left text-xs font-mono">
                <thead>
                  <tr className="bg-black/90 border-b border-white/10 text-text-muted text-[0.7rem]">
                    <th className="p-2">#</th>
                    <th className="p-2">NAME</th>
                    <th className="p-2">TÉLÉPHONE</th>
                    <th className="p-2">ADRESSE / VILLE</th>
                    <th className="p-2">ENTREPRISE / INFOS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {preview.slice(0, 100).map((c, i) => (
                    <tr key={i} className="hover:bg-white/5">
                      <td className="p-2 text-text-muted">{i + 1}</td>
                      <td className="p-2 font-bold text-white">{c.first_name} {c.last_name}</td>
                      <td className="p-2 font-bold text-neon-green tracking-wider">{c.phone}</td>
                      <td className="p-2 text-text-muted truncate max-w-[200px]">{c.address || '--'}</td>
                      <td className="p-2 text-text-muted truncate max-w-[150px]">{c.company || c.notes || '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.length > 100 && (
                <div className="p-2 text-center text-xs font-mono text-text-muted bg-black/40">
                  ... et {preview.length - 100} contacts supplémentaires prêts à l'importation.
                </div>
              )}
            </div>

            {importError && (
              <div className="text-neon-danger text-xs font-mono bg-red-500/10 border border-red-500/30 p-2.5 rounded">
                ⚠️ {importError}
              </div>
            )}
            {importSuccess && (
              <div className="text-neon-green text-xs font-mono bg-neon-green/10 border border-neon-green/30 p-2.5 rounded font-bold animate-pulse">
                {importSuccess}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => handleImportSubmit(false)}
                disabled={importing}
                className="btn-cyber py-2.5 px-4 text-xs font-mono font-bold rounded flex items-center justify-center gap-2 cursor-pointer"
                style={{ borderColor: '#00ff66', color: '#00ff66', background: 'rgba(0,255,102,0.15)' }}
              >
                <span>{importing ? '⟳ IMPORTATION EN COURS...' : `⬆ IMPORTER DANS LA BASE (${preview.length})`}</span>
              </button>

              <button
                type="button"
                onClick={() => handleImportSubmit(true)}
                disabled={importing}
                className="btn-cyber py-2.5 px-4 text-xs font-mono font-bold rounded flex items-center justify-center gap-2 cursor-pointer"
                style={{ borderColor: '#00d4ff', color: '#00d4ff', background: 'rgba(0,212,255,0.15)' }}
              >
                <span>⚡ IMPORTER & METTRE EN FILE DIALER</span>
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
  const [browserSite, setBrowserSite] = useState('tps')
  const [tpsModalOpen, setTpsModalOpen] = useState(false)
  const [tpsInitialPhone, setTpsInitialPhone] = useState('')
  const [clipboardNotification, setClipboardNotification] = useState('')
  const PAGE_SIZE = 20

  const handleOpenBrowser = async (target, phone = '', name = '') => {
    setBrowserSite(target)
    setTpsInitialPhone(phone)
    setBrowserTarget({ phone, name })
    const siteLabel = target === 'fps' ? 'FPS' : 'TPS'
    if (phone) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(phone)
          setClipboardNotification(`Numéro copié — collez-le dans la recherche ${siteLabel}`)
        }
      } catch {
        // Fallback in modal
      }
    }
    setTpsModalOpen(true)
    setTimeout(() => setClipboardNotification(''), 5000)
  }

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
    <div className="p-3 md:p-6 space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="terminal-header mb-1 text-[0.65rem] md:text-xs">Database</div>
          <h1 className="text-lg md:text-xl font-mono font-bold" style={{ color: '#00ff66', textShadow: '0 0 10px #00ff66' }}>
            BASE DE CONTACTS
            <span className="ml-2 text-xs md:text-sm font-normal text-text-muted">
              [{total.toLocaleString()} CONTACTS]
            </span>
          </h1>
        </motion.div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => handleOpenBrowser('tps', '')}
            className="btn-cyber flex-1 sm:flex-initial px-3 py-2 text-xs rounded-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            style={{ borderColor: '#00d4ff', color: '#00d4ff', background: 'rgba(0, 212, 255, 0.12)' }}
            title="Ouvrir le site TruePeopleSearch dans le navigateur embarqué"
          >
            <span>🔎 TPS</span>
          </button>
          <button
            onClick={() => handleOpenBrowser('fps', '')}
            className="btn-cyber flex-1 sm:flex-initial px-3 py-2 text-xs rounded-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            style={{ borderColor: '#ff9900', color: '#ff9900', background: 'rgba(255, 153, 0, 0.12)' }}
            title="Ouvrir le site FastPeopleSearch dans le navigateur embarqué"
          >
            <span>⚡ FPS</span>
          </button>
          <button
            onClick={() => { setShowImport(!showImport); if (!showImport) setShowGenerator(false) }}
            className="btn-cyber w-full sm:w-auto px-4 py-2 text-xs rounded-sm font-bold cursor-pointer text-center justify-center"
            style={{ borderColor: '#00ff66', color: '#00ff66' }}
          >
            {showImport ? '✕ FERMER' : '⬆ IMPORT CSV'}
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
            <ImportPipeline onImport={handleImport} onSaveAndQueue={(list) => addBulkToQueue(list)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[180px]">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="input-cyber w-full pl-8 pr-4 py-2 text-xs rounded-sm"
            placeholder="RECHERCHER CONTACTS..."
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="input-cyber px-3 py-2 text-xs rounded-sm flex-1 sm:flex-initial min-w-[130px]"
          style={{ background: '#080808' }}
        >
          <option value="">TOUS LES STATUTS</option>
          {Object.entries(STATUS_COLORS).map(([key, val]) => (
            <option key={key} value={key}>{val.label}</option>
          ))}
        </select>

        <button
          onClick={() => setFavoriteOnly(!favoriteOnly)}
          className="btn-cyber px-3 py-2 text-xs rounded-sm font-bold flex items-center justify-center gap-1 flex-1 sm:flex-initial"
          style={{
            borderColor: favoriteOnly ? '#ffcc00' : 'rgba(255,204,0,0.4)',
            color: favoriteOnly ? '#ffcc00' : '#888',
            background: favoriteOnly ? 'rgba(255,204,0,0.15)' : 'transparent',
          }}
        >
          {favoriteOnly ? '⭐ FAVORIS' : '☆ FAVORIS'}
        </button>

        <button onClick={loadContacts} className="btn-cyber px-3 py-2 text-xs rounded-sm flex items-center justify-center gap-1 shrink-0">
          ↻ ACTUALISER
        </button>
      </div>

      {/* Quick Phone Lookup Tool */}
      <div className="card-cyber rounded p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border border-neon-green/20" style={{ background: 'rgba(0, 255, 102, 0.02)' }}>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            type="tel"
            value={quickPhone}
            onChange={(e) => setQuickPhone(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && quickPhone.trim()) {
                handleOpenBrowser('tps', quickPhone.trim())
              }
            }}
            placeholder="Recherche TPS/FPS par tél (+1...)"
            className="input-cyber flex-1 px-3 py-2 text-xs rounded-sm font-mono min-w-0"
          />
          <button
            onClick={() => handleOpenBrowser('tps', quickPhone.trim())}
            className="btn-cyber px-3 py-2 text-xs rounded-sm font-bold flex items-center gap-1 shrink-0"
            style={{ borderColor: '#00d4ff', color: '#00d4ff' }}
            title="Copier le numéro et ouvrir TruePeopleSearch"
          >
            <span>🔎 TPS</span>
          </button>
          <button
            onClick={() => handleOpenBrowser('fps', quickPhone.trim())}
            className="btn-cyber px-3 py-2 text-xs rounded-sm font-bold flex items-center gap-1 shrink-0"
            style={{ borderColor: '#ff9900', color: '#ff9900' }}
            title="Copier le numéro et ouvrir FastPeopleSearch"
          >
            <span>⚡ FPS</span>
          </button>
        </div>
        {clipboardNotification && (
          <div className="text-[0.65rem] font-mono text-neon-green animate-pulse w-full">
            ✓ {clipboardNotification}
          </div>
        )}
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

        {/* Desktop Table View */}
        <div className="hidden md:block overflow-x-auto">
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
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleOpenBrowser('tps', contact.phone || '', `${contact.first_name || ''} ${contact.last_name || ''}`.trim())
                                }}
                                className="text-xs font-mono px-2 py-0.5 rounded-sm border border-neon-cyan/50 text-neon-cyan hover:brightness-125 transition-all cursor-pointer"
                                style={{ fontSize: '0.65rem' }}
                                title="Copier le numéro et ouvrir TruePeopleSearch"
                              >
                                🔎 TPS
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleOpenBrowser('fps', contact.phone || '', `${contact.first_name || ''} ${contact.last_name || ''}`.trim())
                                }}
                                className="text-xs font-mono px-2 py-0.5 rounded-sm border border-neon-warn/50 text-neon-warn hover:brightness-125 transition-all cursor-pointer"
                                style={{ fontSize: '0.65rem' }}
                                title="Copier le numéro et ouvrir FastPeopleSearch"
                              >
                                ⚡ FPS
                              </button>
                            </div>
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

        {/* Mobile Cards View (Visible strictly on mobile < md) */}
        <div className="md:hidden p-3 space-y-3">
          {loading ? (
            <div className="text-center py-12 text-neon-green font-mono text-sm">◎ CHARGEMENT DES CONTACTS...</div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-12 text-text-muted text-xs font-mono">
              AUCUN CONTACT TROUVÉ — {search ? 'ESSAYEZ UNE AUTRE RECHERCHE' : 'IMPORTEZ DES CONTACTS'}
            </div>
          ) : (
            contacts.map((contact, i) => {
              const statusCfg = STATUS_COLORS[contact.status] || { label: 'INCONNU', color: '#3d5a3d' }
              const isChecked = selectedIds.has(contact.id)
              return (
                <motion.div
                  key={contact.id || i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-sm p-3.5 border transition-all ${
                    isChecked ? 'border-neon-green bg-neon-green/10' : 'border-neon-green/20 bg-black/40'
                  }`}
                >
                  {/* Top row: Checkbox, Name, Favorite & Status badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleSelectOne(contact.id)}
                        className="cursor-pointer accent-neon-green w-4 h-4 shrink-0"
                      />
                      <button
                        type="button"
                        onClick={() => toggleFavoriteContact(contact)}
                        className="text-sm font-mono text-yellow-400 shrink-0"
                        title={contact.is_favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
                      >
                        {contact.is_favorite ? '⭐' : '☆'}
                      </button>
                      <div className="font-mono font-bold text-sm text-text-terminal truncate">
                        {contact.first_name} {contact.last_name}
                      </div>
                    </div>
                    <span
                      className="badge-cyber rounded-sm text-[0.65rem] shrink-0"
                      style={{
                        color: statusCfg.color,
                        background: `${statusCfg.color}18`,
                        border: `1px solid ${statusCfg.color}44`,
                      }}
                    >
                      {statusCfg.label}
                    </span>
                  </div>

                  {/* Details row: Phone & Address */}
                  <div className="mt-2.5 space-y-1 font-mono text-xs">
                    <div className="text-neon-dim font-bold tracking-wider flex items-center gap-1.5">
                      <span>📞</span>
                      <span>{contact.phone}</span>
                    </div>
                    {contact.address && (
                      <div className="text-text-muted text-[0.7rem] truncate flex items-center gap-1.5">
                        <span>🏠</span>
                        <span>{contact.address}</span>
                      </div>
                    )}
                  </div>

                  {/* Mobile Action Buttons Grid */}
                  <div className="grid grid-cols-4 gap-1.5 mt-3 pt-2.5 border-t border-white/10">
                    <button
                      type="button"
                      onClick={() => addToQueue(contact)}
                      className="btn-cyber py-2 text-[0.7rem] rounded-sm font-bold flex items-center justify-center gap-1"
                      style={{ borderColor: '#00ff66', color: '#00ff66', background: 'rgba(0,255,102,0.1)' }}
                      title="Ajouter à la file du dialer"
                    >
                      <span>+</span>
                      <span>FILE</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenBrowser('tps', contact.phone || '', `${contact.first_name || ''} ${contact.last_name || ''}`.trim())}
                      className="btn-cyber py-2 text-[0.7rem] rounded-sm font-bold flex items-center justify-center gap-1"
                      style={{ borderColor: '#00d4ff', color: '#00d4ff' }}
                    >
                      <span>🔎</span>
                      <span>TPS</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenBrowser('fps', contact.phone || '', `${contact.first_name || ''} ${contact.last_name || ''}`.trim())}
                      className="btn-cyber py-2 text-[0.7rem] rounded-sm font-bold flex items-center justify-center gap-1"
                      style={{ borderColor: '#ff9900', color: '#ff9900' }}
                    >
                      <span>⚡</span>
                      <span>FPS</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedContact(contact)}
                      className="btn-cyber py-2 text-[0.7rem] rounded-sm font-bold flex items-center justify-center gap-1 text-text-muted hover:text-white"
                    >
                      <span>👁</span>
                      <span>VOIR</span>
                    </button>
                  </div>
                </motion.div>
              )
            })
          )}
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

      {/* Embedded Chromium Browser Modal */}
      <EmbeddedBrowserModal
        isOpen={tpsModalOpen || Boolean(browserTarget)}
        onClose={() => {
          setTpsModalOpen(false)
          setBrowserTarget(null)
        }}
        initialTarget={browserSite}
        initialPhone={tpsInitialPhone || browserTarget?.phone || ''}
        contactName={browserTarget?.name || ''}
        onImportSuccess={() => loadContacts()}
      />
    </div>
  )
}

