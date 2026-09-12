import { useState } from 'react'
import { motion } from 'framer-motion'
import TPSGeneratorModal from './TPSGeneratorModal.jsx'

const STATUS_CONFIG = {
  new:        { label: 'NEW',         color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  answered:   { label: 'ANSWERED',    color: '#00ff66', bg: 'rgba(0,255,102,0.1)'   },
  busy:       { label: 'BUSY',        color: '#ff9900', bg: 'rgba(255,153,0,0.1)'   },
  voicemail:  { label: 'VOICEMAIL',   color: '#a855f7', bg: 'rgba(168,85,247,0.1)'  },
  wrong_number: { label: 'WRONG #',  color: '#ff2244', bg: 'rgba(255,34,68,0.1)'   },
  do_not_call:  { label: 'DNC',       color: '#ff2244', bg: 'rgba(255,34,68,0.15)'  },
  no_answer:  { label: 'NO ANSWER',   color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  callback:   { label: 'CALLBACK',    color: '#00d4ff', bg: 'rgba(0,212,255,0.1)'   },
  default:    { label: 'UNKNOWN',     color: '#3d5a3d', bg: 'rgba(61,90,61,0.1)'    },
}

export default function ContactCard({ contact, onAddToQueue, onView, compact = false }) {
  const [browserOpen, setBrowserOpen] = useState(false)

  if (!contact) return null

  const statusCfg = STATUS_CONFIG[contact.status] || STATUS_CONFIG.default

  if (compact) {
    return (
      <motion.div
        layout
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -10 }}
        className="flex items-center justify-between p-3 rounded-sm border border-neon-green border-opacity-10 bg-bg-card hover:border-opacity-30 transition-all group"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-sm flex items-center justify-center bg-neon-green bg-opacity-10 text-neon-green text-xs font-mono font-bold flex-shrink-0">
            {(contact.first_name?.[0] || contact.name?.[0] || '?').toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-text-terminal text-xs font-mono font-semibold truncate">
              {contact.first_name} {contact.last_name}
            </div>
            <div className="text-text-muted text-xs font-mono truncate">{contact.phone}</div>
          </div>
        </div>
        <div
          className="badge-cyber rounded-sm text-xs flex-shrink-0 ml-2"
          style={{ color: statusCfg.color, background: statusCfg.bg, border: `1px solid ${statusCfg.color}44` }}
        >
          {statusCfg.label}
        </div>
      </motion.div>
    )
  }

  return (
    <>
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className="card-cyber rounded p-4 group cursor-pointer"
        whileHover={{ y: -2 }}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Avatar */}
          <div className="w-10 h-10 rounded-sm flex items-center justify-center bg-neon-green bg-opacity-10 text-neon-green font-mono font-bold text-lg flex-shrink-0"
            style={{ border: '1px solid rgba(0,255,102,0.2)' }}>
            {(contact.first_name?.[0] || contact.name?.[0] || '?').toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="text-text-terminal font-mono font-semibold text-sm flex items-center gap-1.5">
              <span>{contact.first_name} {contact.last_name}</span>
              {contact.is_favorite && <span className="text-yellow-400 text-xs">⭐</span>}
            </div>
            <div className="text-neon-dim font-mono text-xs mt-0.5">{contact.phone}</div>
            {contact.address && (
              <div className="text-text-muted font-mono text-xs mt-0.5 truncate">{contact.address}</div>
            )}
          </div>

          {/* Status */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <div
              className="badge-cyber rounded-sm"
              style={{ color: statusCfg.color, background: statusCfg.bg, border: `1px solid ${statusCfg.color}44` }}
            >
              {statusCfg.label}
            </div>
          </div>
        </div>

        {/* Actions */}
        {(onAddToQueue || onView) && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-neon-green border-opacity-10">
            {onView && (
              <button
                onClick={() => onView(contact)}
                className="btn-cyber flex-1 py-1 text-xs rounded-sm"
              >
                VIEW
              </button>
            )}
            {onAddToQueue && (
              <button
                onClick={() => onAddToQueue(contact)}
                className="btn-cyber flex-1 py-1 text-xs rounded-sm"
                style={{ borderColor: '#00ff66', color: '#00ff66' }}
              >
                + QUEUE
              </button>
            )}
          </div>
        )}

        {/* External Lookup Links */}
        {contact.phone && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-neon-green border-opacity-10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setBrowserOpen(true)
              }}
              className="btn-cyber px-2.5 py-1 rounded-sm flex items-center gap-1 hover:brightness-125 transition-all"
              style={{ borderColor: '#00d4ff', color: '#00d4ff', fontSize: '0.65rem' }}
              title="Rechercher avec le navigateur embarqué TPS & FPS"
            >
              🌐 RECHERCHE EMBARQUÉE (TPS / FPS)
            </button>
          </div>
        )}

        {/* Source tag */}
        {contact.source && (
          <div className="mt-2">
            <span className="text-text-muted text-xs font-mono" style={{ fontSize: '0.6rem', letterSpacing: '0.1em' }}>
              SRC: {contact.source.toUpperCase()}
            </span>
          </div>
        )}
      </motion.div>

      {/* TPS Generator Modal */}
      {contact.phone && (
        <TPSGeneratorModal
          isOpen={browserOpen}
          onClose={() => setBrowserOpen(false)}
          initialPhone={contact.phone}
          contactName={`${contact.first_name || ''} ${contact.last_name || ''}`}
          onAddToQueue={onAddToQueue}
        />
      )}
    </>
  )
}
