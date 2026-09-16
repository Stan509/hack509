import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../contexts/AuthContext.jsx'

export default function CapturePreviewModal({
  isOpen,
  onClose,
  capturedLeads = [],
  source = 'TPS',
  currentUrl = '',
  onImportSuccess
}) {
  const [leads, setLeads] = useState([])
  const [selectedIndices, setSelectedIndices] = useState(new Set())
  const [importing, setImporting] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  // Initialize leads when opened
  useState(() => {
    if (capturedLeads && capturedLeads.length > 0) {
      setLeads(capturedLeads.map((l, i) => ({ ...l, _id: i })))
      setSelectedIndices(new Set(capturedLeads.map((_, i) => i)))
    }
  }, [capturedLeads])

  // Detect duplicates based on normalized phone or full name
  const duplicatesSet = useMemo(() => {
    const counts = {}
    const dupes = new Set()
    leads.forEach((l) => {
      const p = (l.phone || '').replace(/\D/g, '')
      const n = `${l.first_name || ''} ${l.last_name || ''}`.trim().toLowerCase()
      if (p) {
        counts[p] = (counts[p] || 0) + 1
        if (counts[p] > 1) dupes.add(l._id)
      } else if (n) {
        counts[n] = (counts[n] || 0) + 1
        if (counts[n] > 1) dupes.add(l._id)
      }
    })
    return dupes
  }, [leads])

  if (!isOpen) return null

  const handleFieldChange = (id, field, value) => {
    setLeads((prev) =>
      prev.map((item) => (item._id === id ? { ...item, [field]: value } : item))
    )
  }

  const handleDeleteRow = (id) => {
    setLeads((prev) => prev.filter((item) => item._id !== id))
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const toggleSelectRow = (id) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIndices.size === leads.length) {
      setSelectedIndices(new Set())
    } else {
      setSelectedIndices(new Set(leads.map((l) => l._id)))
    }
  }

  const sanitizeCSV = (val) => {
    if (val === null || val === undefined) return '""'
    let s = String(val).trim()
    // Neutralize formula injection
    if (s.startsWith('=') || s.startsWith('+') || s.startsWith('-') || s.startsWith('@')) {
      s = "'" + s
    }
    return `"${s.replace(/"/g, '""')}"`
  }

  const handleExportCSV = () => {
    const selected = leads.filter((l) => selectedIndices.has(l._id))
    if (selected.length === 0) {
      alert('Veuillez sélectionner au moins une ligne à exporter.')
      return
    }

    const headers = [
      'first_name',
      'last_name',
      'company',
      'phone',
      'city',
      'state',
      'source',
      'source_url',
      'captured_at'
    ]

    const rows = selected.map((l) => [
      sanitizeCSV(l.first_name),
      sanitizeCSV(l.last_name),
      sanitizeCSV(l.company),
      sanitizeCSV(l.phone),
      sanitizeCSV(l.city),
      sanitizeCSV(l.state),
      sanitizeCSV(l.source || source),
      sanitizeCSV(l.source_url || currentUrl),
      sanitizeCSV(l.captured_at || new Date().toISOString())
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    const dateStr = new Date().toISOString().slice(0, 10)
    const srcTag = (source || 'leads').toLowerCase()
    link.href = url
    link.download = `hack509_${srcTag}_${dateStr}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    setStatusMessage(`✓ ${selected.length} contact(s) exporté(s) en CSV.`)
    setTimeout(() => setStatusMessage(''), 4000)
  }

  const handleImportToHack509 = async () => {
    const selected = leads.filter((l) => selectedIndices.has(l._id))
    if (selected.length === 0) {
      alert('Veuillez sélectionner au moins un contact à importer.')
      return
    }

    setImporting(true)
    setStatusMessage('')
    try {
      const contactsToImport = selected.map((l) => ({
        first_name: (l.first_name || '').trim(),
        last_name: (l.last_name || '').trim(),
        phone: (l.phone || '').trim(),
        address: [l.city, l.state].filter(Boolean).join(', ') || l.address || '',
        notes: `Capturé via ${l.source || source}. Entreprise: ${l.company || 'N/A'}. URL: ${l.source_url || currentUrl}`,
        source: `capture_${(l.source || source).toLowerCase()}`,
        status: 'new'
      }))

      const resp = await api.post('/api/contacts/import/', {
        contacts: contactsToImport,
        source: `capture_${(source || 'web').toLowerCase()}`
      })

      const count = resp.data?.imported ?? selected.length
      setStatusMessage(`✓ ${count} prospect(s) importé(s) avec succès dans Hack509 !`)
      if (onImportSuccess) onImportSuccess(resp.data)
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (err) {
      console.error('Import error:', err)
      alert("Erreur lors de l'importation: " + (err.response?.data?.message || err.message))
    } finally {
      setImporting(false)
    }
  }

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        style={{ background: 'rgba(0, 0, 0, 0.88)', backdropFilter: 'blur(8px)' }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="card-cyber w-full max-w-5xl h-[85vh] flex flex-col rounded overflow-hidden shadow-2xl"
          style={{ border: '1px solid rgba(0, 255, 102, 0.4)', boxShadow: '0 0 50px rgba(0, 255, 102, 0.2)' }}
        >
          {/* Header */}
          <div className="bg-black/90 px-5 py-3 border-b border-neon-green/30 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onClose}
                  className="w-3.5 h-3.5 rounded-full bg-red-500 hover:brightness-125 transition-all cursor-pointer"
                  title="Fermer"
                />
                <div className="w-3.5 h-3.5 rounded-full bg-yellow-500 opacity-60" />
                <div className="w-3.5 h-3.5 rounded-full bg-green-500 opacity-60" />
              </div>
              <div className="h-4 w-px bg-white/20" />
              <div className="terminal-header flex items-center gap-2 text-sm font-bold tracking-wide">
                <span>📋 PRÉVISUALISATION DES DONNÉES CAPTURÉES ({leads.length})</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="px-2.5 py-0.5 rounded-sm bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-[0.7rem] font-mono">
                SOURCE: {source}
              </div>
              <button
                onClick={onClose}
                className="text-text-muted hover:text-neon-danger text-sm font-mono px-2 py-0.5 cursor-pointer"
              >
                ✕ FERMER
              </button>
            </div>
          </div>

          {/* Banner message & controls */}
          <div className="bg-black/70 px-5 py-2.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-mono text-text-muted">
              Vérifiez et modifiez les données de la page avant tout enregistrement. Aucune donnée n'est importée automatiquement.
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={toggleSelectAll}
                className="px-2.5 py-1 text-xs font-mono border border-white/20 hover:border-neon-green text-white rounded-sm transition-colors cursor-pointer"
              >
                {selectedIndices.size === leads.length ? 'TOUT DÉSÉLECTIONNER' : 'TOUT SÉLECTIONNER'}
              </button>
              <button
                onClick={handleExportCSV}
                className="btn-cyber px-3 py-1 text-xs font-mono font-bold rounded-sm flex items-center gap-1.5"
                style={{ borderColor: '#00d4ff', color: '#00d4ff' }}
                title="Exporter les fiches sélectionnées au format CSV"
              >
                <span>💾 EXPORTER EN CSV</span>
              </button>
              <button
                onClick={handleImportToHack509}
                disabled={importing || selectedIndices.size === 0}
                className="btn-cyber px-4 py-1 text-xs font-mono font-bold rounded-sm flex items-center gap-1.5"
                style={{ borderColor: '#00ff66', color: '#00ff66', opacity: selectedIndices.size === 0 ? 0.4 : 1 }}
                title="Importer directement dans le carnet Hack509"
              >
                <span>{importing ? 'IMPORT EN COURS...' : '📥 IMPORTER DANS HACK509'}</span>
              </button>
            </div>
          </div>

          {/* Status notification */}
          {statusMessage && (
            <div className="bg-neon-green/10 border-b border-neon-green/30 px-5 py-1.5 text-xs font-mono text-neon-green font-bold text-center">
              {statusMessage}
            </div>
          )}

          {/* Main Table */}
          <div className="flex-1 overflow-y-auto p-4 scrollbar-cyber">
            {leads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 space-y-3">
                <div className="text-3xl">🔍</div>
                <div className="text-neon-warn font-mono font-bold text-sm">
                  AUCUNE DONNÉE RECONNUE SUR CETTE PAGE
                </div>
                <div className="text-text-muted text-xs font-mono max-w-md">
                  Vérifiez que la recherche manuelle a abouti à des résultats visibles dans le navigateur avant de cliquer sur Capturer.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono border-collapse">
                  <thead>
                    <tr className="border-b border-white/20 text-text-muted text-[0.7rem] bg-black/60">
                      <th className="p-2 w-8 text-center">✓</th>
                      <th className="p-2">PRÉNOM</th>
                      <th className="p-2">NOM</th>
                      <th className="p-2">TÉLÉPHONE</th>
                      <th className="p-2">ENTREPRISE / OPÉRATEUR</th>
                      <th className="p-2">VILLE</th>
                      <th className="p-2">ÉTAT</th>
                      <th className="p-2 text-center">STATUT</th>
                      <th className="p-2 text-center">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((lead) => {
                      const isSelected = selectedIndices.has(lead._id)
                      const isDupe = duplicatesSet.has(lead._id)

                      return (
                        <tr
                          key={lead._id}
                          className={`border-b border-white/5 transition-colors ${
                            isSelected ? 'bg-white/[0.03]' : 'opacity-60 bg-transparent'
                          } hover:bg-white/[0.06]`}
                        >
                          {/* Checkbox */}
                          <td className="p-2 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectRow(lead._id)}
                              className="accent-neon-green cursor-pointer"
                            />
                          </td>

                          {/* First Name */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={lead.first_name || ''}
                              onChange={(e) => handleFieldChange(lead._id, 'first_name', e.target.value)}
                              className="input-cyber px-2 py-1 text-xs rounded-sm w-28 text-white font-bold"
                            />
                          </td>

                          {/* Last Name */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={lead.last_name || ''}
                              onChange={(e) => handleFieldChange(lead._id, 'last_name', e.target.value)}
                              className="input-cyber px-2 py-1 text-xs rounded-sm w-32 text-white font-bold"
                            />
                          </td>

                          {/* Phone */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={lead.phone || ''}
                              onChange={(e) => handleFieldChange(lead._id, 'phone', e.target.value)}
                              className="input-cyber px-2 py-1 text-xs rounded-sm w-36 text-neon-green font-mono font-bold"
                            />
                          </td>

                          {/* Company */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={lead.company || ''}
                              placeholder="Entreprise / Opérateur"
                              onChange={(e) => handleFieldChange(lead._id, 'company', e.target.value)}
                              className="input-cyber px-2 py-1 text-xs rounded-sm w-44 text-yellow-400"
                            />
                          </td>

                          {/* City */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={lead.city || ''}
                              placeholder="Ville"
                              onChange={(e) => handleFieldChange(lead._id, 'city', e.target.value)}
                              className="input-cyber px-2 py-1 text-xs rounded-sm w-28 text-text-muted"
                            />
                          </td>

                          {/* State */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={lead.state || ''}
                              placeholder="État"
                              onChange={(e) => handleFieldChange(lead._id, 'state', e.target.value)}
                              className="input-cyber px-2 py-1 text-xs rounded-sm w-14 text-text-muted text-center"
                            />
                          </td>

                          {/* Duplicate Badge */}
                          <td className="p-2 text-center">
                            {isDupe ? (
                              <span className="px-2 py-0.5 rounded-sm bg-neon-warn/20 border border-neon-warn/40 text-neon-warn text-[0.65rem] font-mono font-bold">
                                DOUBLON
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-sm bg-neon-green/10 text-neon-green text-[0.65rem] font-mono">
                                UNIQUE
                              </span>
                            )}
                          </td>

                          {/* Delete Action */}
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(lead._id)}
                              className="text-text-muted hover:text-neon-danger transition-colors text-xs font-mono p-1 cursor-pointer"
                              title="Supprimer cette ligne"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="bg-black/90 px-5 py-3 border-t border-white/10 flex items-center justify-between">
            <div className="text-xs font-mono text-text-muted">
              Sélectionnés : <strong className="text-white">{selectedIndices.size}</strong> / {leads.length}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="btn-cyber btn-danger px-4 py-1.5 text-xs rounded-sm font-mono cursor-pointer"
              >
                ANNULER
              </button>
              <button
                type="button"
                onClick={handleImportToHack509}
                disabled={importing || selectedIndices.size === 0}
                className="btn-cyber px-5 py-1.5 text-xs rounded-sm font-mono font-bold cursor-pointer"
                style={{ borderColor: '#00ff66', color: '#00ff66' }}
              >
                {importing ? 'IMPORT EN COURS...' : `VALIDER L'IMPORTATION (${selectedIndices.size})`}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
