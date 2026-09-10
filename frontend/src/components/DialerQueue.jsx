import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDialer } from '../contexts/DialerContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'

function QueueItem({ contact, index, isActive, onRemove, onToggleFav }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ delay: index * 0.03 }}
      className={`flex items-center gap-3 p-3 rounded-sm transition-all group ${
        isActive
          ? 'bg-neon-green bg-opacity-10 border border-neon-green border-opacity-50'
          : 'border border-neon-green border-opacity-5 hover:border-opacity-20'
      }`}
    >
      {/* Position badge */}
      <div
        className="w-6 h-6 rounded-sm flex items-center justify-center text-xs font-mono font-bold flex-shrink-0"
        style={{
          background: isActive ? 'rgba(0,255,102,0.2)' : 'rgba(61,90,61,0.2)',
          color: isActive ? '#00ff66' : '#3d5a3d',
          boxShadow: isActive ? '0 0 6px rgba(0,255,102,0.4)' : 'none',
        }}
      >
        {isActive ? '▶' : index + 1}
      </div>

      {/* Contact info */}
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-mono font-semibold truncate flex items-center gap-1.5 ${isActive ? 'text-neon-green' : 'text-text-terminal'}`}
          style={isActive ? { textShadow: '0 0 6px #00ff66' } : {}}>
          <span className="truncate">{contact.first_name || ''} {contact.last_name || contact.name || 'UNKNOWN'}</span>
          {contact.is_favorite && <span className="text-yellow-400 text-xs" title="Favori">⭐</span>}
        </div>
        <div className="text-text-muted text-xs font-mono truncate">{contact.phone}</div>
      </div>

      {/* Favorite Toggle Button */}
      <button
        onClick={() => onToggleFav && onToggleFav(contact)}
        className="text-xs font-mono px-1 text-yellow-400 opacity-60 hover:opacity-100 transition-opacity"
        title={contact.is_favorite ? "Retirer des favoris" : "Marquer comme favori"}
      >
        {contact.is_favorite ? '⭐' : '☆'}
      </button>

      {/* Remove button */}
      <button
        onClick={() => onRemove(contact.id)}
        className="opacity-0 group-hover:opacity-100 text-neon-danger text-xs font-mono px-1 transition-opacity"
        style={{ fontSize: '0.8rem' }}
      >
        ✕
      </button>
    </motion.div>
  )
}

export default function DialerQueue({ onAddContact }) {
  const { queue, currentContact, callStatus, queuePaused, pauseQueue, resumeQueue, removeFromQueue, addBulkToQueue, toggleFavoriteContact } = useDialer()
  const { api } = useAuth()
  const [loadingFavs, setLoadingFavs] = useState(false)

  const handleLoadFavorites = async () => {
    setLoadingFavs(true)
    try {
      const res = await api.get('/api/contacts/?is_favorite=true&page_size=100')
      const favContacts = res.data.results || res.data || []
      if (favContacts.length > 0) {
        addBulkToQueue(favContacts)
      }
    } catch (err) {
      console.error('Erreur chargement favoris:', err)
    } finally {
      setLoadingFavs(false)
    }
  }

  return (
    <div className="flex flex-col h-full card-cyber rounded overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-neon-green border-opacity-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div>
              <div className="terminal-header">Contact Queue</div>
              <h3 className="text-text-terminal text-sm font-mono font-bold">
                CALL QUEUE
                <span
                  className="ml-2 inline-flex items-center justify-center w-6 h-5 text-xs font-mono rounded-sm"
                  style={{ background: 'rgba(0,255,102,0.15)', color: '#00ff66', border: '1px solid rgba(0,255,102,0.3)' }}
                >
                  {queue.length}
                </span>
              </h3>
            </div>
          </div>

          {/* Pause/Resume */}
          <button
            onClick={queuePaused ? resumeQueue : pauseQueue}
            className={`btn-cyber px-3 py-1 text-xs rounded-sm ${queuePaused ? '' : 'btn-warn'}`}
            style={queuePaused ? {} : { borderColor: '#ff9900', color: '#ff9900' }}
          >
            {queuePaused ? '▶ RESUME' : '⏸ PAUSE'}
          </button>
        </div>

        {/* Pause indicator */}
        <AnimatePresence>
          {queuePaused && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex items-center gap-2 text-xs font-mono py-1 px-2 rounded-sm"
              style={{ background: 'rgba(255,153,0,0.1)', border: '1px solid rgba(255,153,0,0.3)', color: '#ff9900' }}
            >
              <span style={{ animation: 'pulse-dot 1s infinite' }}>⏸</span>
              QUEUE PAUSED — CALLS SUSPENDED
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto scrollbar-cyber p-3 space-y-2">
        <AnimatePresence mode="popLayout">
          {queue.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <div className="text-text-muted text-3xl mb-3">◎</div>
              <div className="text-text-muted text-xs font-mono tracking-wider">QUEUE EMPTY</div>
              <div className="text-text-muted text-xs font-mono mt-1 opacity-50">
                Add contacts or load favorites
              </div>
            </motion.div>
          ) : (
            queue.map((contact, index) => (
              <QueueItem
                key={contact.id || index}
                contact={contact}
                index={index}
                isActive={currentContact?.id === contact.id && callStatus !== 'idle'}
                onRemove={removeFromQueue}
                onToggleFav={toggleFavoriteContact}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-neon-green border-opacity-10 flex gap-2">
        <button
          onClick={onAddContact}
          className="btn-cyber flex-1 py-2 text-xs rounded-sm"
        >
          + ADD TO QUEUE
        </button>
        <button
          onClick={handleLoadFavorites}
          disabled={loadingFavs}
          className="btn-cyber py-2 px-3 text-xs rounded-sm font-bold flex items-center gap-1"
          style={{ borderColor: '#ffcc00', color: '#ffcc00', background: 'rgba(255,204,0,0.1)' }}
          title="Charger tous les contacts favoris dans la file d'attente"
        >
          {loadingFavs ? '⟳' : '⭐ FAVORIS'}
        </button>
      </div>
    </div>
  )
}
