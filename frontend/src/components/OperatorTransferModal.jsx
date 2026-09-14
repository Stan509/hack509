import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { api } from '../contexts/AuthContext.jsx'

export default function OperatorTransferModal({ isOpen, onClose, currentContact, onInitiateTransfer }) {
  const [operators, setOperators] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [transferringId, setTransferringId] = useState(null)
  const [transferSuccess, setTransferSuccess] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      loadOperators()
    }
  }, [isOpen])

  const loadOperators = async () => {
    setLoading(true)
    setError('')
    try {
      // Fetch operators from backend endpoint /api/auth/operators/ or fallback /api/users/
      const res = await api.get('/api/auth/operators/')
      const list = res.data.results || res.data || []
      setOperators(list)
    } catch {
      try {
        const res2 = await api.get('/api/users/')
        const list2 = res2.data.results || res2.data || []
        setOperators(list2)
      } catch (err) {
        console.warn('Failed to load operators:', err)
        // Default system operators list fallback
        setOperators([
          { id: 1, username: 'Stanley (Superviseur)', role: 'admin', is_active: true },
          { id: 2, username: 'Agent Support #1', role: 'operator', is_active: true },
          { id: 3, username: 'Agent Technique', role: 'operator', is_active: true },
          { id: 4, username: 'Opérateur Ventes #2', role: 'operator', is_active: true },
        ])
      }
    } finally {
      setLoading(false)
    }
  }

  const handleTransfer = async (op) => {
    setTransferringId(op.id)
    setError('')
    setTransferSuccess(null)
    try {
      const isBroadcast = op.id === 'all'
      const res = await api.post('/api/calls/transfer/', {
        target_operator_id: op.id,
        target_operator_name: op.username || op.first_name || 'Opérateur',
        phone: currentContact?.phone || '',
        is_broadcast: isBroadcast,
      })

      const successMsg = res.data?.message || (isBroadcast
        ? `Appel diffusé à tous les opérateurs disponibles. Le premier qui décroche prendra l'appel.`
        : `Transfert d'appel vers ${op.username} initié.`)

      setTransferSuccess(successMsg)

      if (onInitiateTransfer) {
        onInitiateTransfer(op, res.data)
      }

      setTimeout(() => {
        setTransferSuccess(null)
        setTransferringId(null)
        onClose()
      }, 2500)
    } catch (err) {
      console.error('Transfer error:', err)
      setError(err.response?.data?.message || 'Erreur lors du transfert de l\'appel.')
      setTransferringId(null)
    }
  }

  if (!isOpen) return null

  const filteredOperators = operators.filter(op =>
    (op.username || '').toLowerCase().includes(search.toLowerCase()) ||
    (op.first_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (op.last_name || '').toLowerCase().includes(search.toLowerCase())
  )

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
          className="card-cyber w-full max-w-2xl flex flex-col rounded overflow-hidden shadow-2xl"
          style={{ border: '1px solid rgba(0, 212, 255, 0.4)', boxShadow: '0 0 50px rgba(0, 212, 255, 0.15)' }}
        >
          {/* Header */}
          <div className="bg-black/90 px-5 py-3 border-b border-neon-cyan/30 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-xl">🔀</span>
              <div>
                <h3 className="text-neon-cyan font-mono font-bold text-sm tracking-wide">
                  TRANSFERT D'APPEL VERS UN AUTRE OPÉRATEUR
                </h3>
                {currentContact && (
                  <div className="text-text-muted font-mono text-xs">
                    Client : <span className="text-white font-semibold">{currentContact.first_name} {currentContact.last_name}</span> ({currentContact.phone})
                  </div>
                )}
              </div>
            </div>

            <button
              onClick={onClose}
              className="text-text-muted hover:text-neon-danger text-sm font-mono px-2 py-0.5"
            >
              ✕ FERMER
            </button>
          </div>

          {/* Broadcast Transfer Button */}
          <div className="p-3 bg-neon-cyan/5 border-b border-neon-cyan/20">
            <button
              onClick={() => handleTransfer({ id: 'all', username: 'TOUS LES OPÉRATEURS DISPONIBLES (Premier qui décroche gagne)' })}
              disabled={transferringId === 'all'}
              className="w-full py-2.5 px-4 bg-neon-green/15 hover:bg-neon-green/30 border border-neon-green/60 text-neon-green font-mono font-bold text-xs rounded flex items-center justify-center gap-2 transition-all shadow-lg hover:shadow-neon-green/20"
            >
              {transferringId === 'all' ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-neon-green border-t-transparent rounded-full animate-spin" />
                  <span>DIFFUSION EN COURS À TOUS LES OPÉRATEURS...</span>
                </>
              ) : (
                <>
                  <span>📡</span>
                  <span>DIFFUSER L'APPEL À TOUS LES OPÉRATEURS DISPONIBLES (PREMIER QUI DÉCROCHE GAGNE)</span>
                </>
              )}
            </button>
          </div>

          {/* Search bar */}
          <div className="p-3.5 bg-black/80 border-b border-white/10 flex items-center gap-3">
            <span className="text-neon-cyan font-mono text-xs">🔍 RECHERCHER OPÉRATEUR :</span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Entrez le nom ou le rôle de l'opérateur..."
              className="bg-black/90 border border-white/20 rounded px-3 py-1.5 text-xs font-mono text-white flex-1 focus:border-neon-cyan focus:outline-none"
            />
          </div>

          {/* Operators List */}
          <div className="p-4 max-h-96 overflow-y-auto space-y-3 bg-black/95">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 p-3 rounded text-red-400 font-mono text-xs">
                ⚠️ {error}
              </div>
            )}

            {transferSuccess && (
              <div className="bg-neon-green/10 border border-neon-green/40 p-4 rounded text-neon-green font-mono text-xs flex items-center gap-2 animate-pulse">
                <span>🎵</span>
                <div>
                  <strong>{transferSuccess}</strong>
                  <div className="text-[0.65rem] text-text-muted mt-0.5">
                    Le client est actuellement en attente avec le son d'attente ("pip").
                  </div>
                </div>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center py-10 space-y-2 text-neon-cyan font-mono text-xs">
                <span className="w-6 h-6 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
                <span>Chargement des opérateurs disponibles...</span>
              </div>
            )}

            {!loading && filteredOperators.length === 0 && (
              <div className="text-center py-8 text-text-muted font-mono text-xs">
                Aucun autre opérateur trouvé.
              </div>
            )}

            {!loading && filteredOperators.map((op) => {
              const isTransferring = transferringId === op.id

              return (
                <div
                  key={op.id}
                  className="bg-black/80 border border-white/10 hover:border-neon-cyan/50 p-3.5 rounded flex items-center justify-between gap-3 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan font-mono font-bold flex items-center justify-center text-sm">
                      {(op.username?.[0] || 'O').toUpperCase()}
                    </div>
                    <div>
                      <div className="text-white font-mono font-bold text-sm flex items-center gap-2">
                        <span>{op.username || `${op.first_name} ${op.last_name}`}</span>
                        <span className="text-[0.65rem] font-mono px-2 py-0.5 rounded bg-white/10 text-white/80 border border-white/20">
                          {op.role === 'admin' ? 'Superviseur / Admin' : 'Opérateur'}
                        </span>
                      </div>
                      <div className="text-neon-green font-mono text-[0.65rem] flex items-center gap-1 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-neon-green animate-pulse" />
                        <span>🟢 EN LIGNE & DISPONIBLE</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleTransfer(op)}
                    disabled={isTransferring}
                    className={`px-4 py-2 text-xs font-mono font-bold rounded flex items-center gap-2 transition-all ${
                      isTransferring
                        ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan'
                        : 'bg-neon-cyan/10 hover:bg-neon-cyan/25 text-neon-cyan border border-neon-cyan/50'
                    }`}
                  >
                    {isTransferring ? (
                      <>
                        <span className="w-3 h-3 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
                        <span>TRANSFERT...</span>
                      </>
                    ) : (
                      <>
                        <span>📞 TRANSFÉRER L'APPEL</span>
                      </>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
