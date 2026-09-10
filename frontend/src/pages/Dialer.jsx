import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDialer } from '../contexts/DialerContext.jsx'
import { useAuth } from '../contexts/AuthContext.jsx'
import DialerQueue from '../components/DialerQueue.jsx'
import CallControls from '../components/CallControls.jsx'
import StatusTagger from '../components/StatusTagger.jsx'
import AudioProcessor from '../components/AudioProcessor.jsx'

function AddContactModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', phone: '', address: '' })
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.phone.trim()) { setError('Phone number required'); return }
    onAdd({ ...form, id: `manual_${Date.now()}`, status: 'new', source: 'manual' })
    onClose()
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9 }}
        className="card-cyber rounded p-6 w-full max-w-md mx-4"
        style={{ border: '1px solid rgba(0,255,102,0.3)', boxShadow: '0 0 40px rgba(0,255,102,0.1)' }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="terminal-header mb-0.5">Manual Entry</div>
            <h3 className="text-text-terminal font-mono font-bold">ADD TO QUEUE</h3>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-neon-danger text-lg font-mono">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {[
            { key: 'first_name', label: 'FIRST_NAME:', placeholder: 'John' },
            { key: 'last_name', label: 'LAST_NAME:', placeholder: 'Doe' },
            { key: 'phone', label: 'PHONE_NUMBER:', placeholder: '+1-555-000-0000', required: true },
            { key: 'address', label: 'ADDRESS:', placeholder: '123 Main St' },
          ].map((field) => (
            <div key={field.key}>
              <label className="block terminal-header mb-1">{field.label}</label>
              <input
                type={field.key === 'phone' ? 'tel' : 'text'}
                value={form[field.key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [field.key]: e.target.value }))}
                className="input-cyber w-full px-3 py-2 text-sm rounded-sm"
                placeholder={field.placeholder}
                required={field.required}
              />
            </div>
          ))}

          {error && <div className="text-neon-danger text-xs font-mono">{error}</div>}

          <div className="flex gap-2 pt-2">
            <button type="submit" className="btn-cyber flex-1 py-2 text-xs rounded-sm font-bold">
              + ADD TO QUEUE
            </button>
            <button type="button" onClick={onClose} className="btn-cyber btn-danger px-4 py-2 text-xs rounded-sm">
              CANCEL
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  )
}

function OutcomePanel() {
  const { currentContact, callStatus, logCallOutcome } = useDialer()
  const [selectedOutcome, setSelectedOutcome] = useState('')
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [recentOutcomes, setRecentOutcomes] = useState([])

  const handleSubmit = () => {
    if (!selectedOutcome) return
    logCallOutcome(selectedOutcome, notes)
    const outcome = {
      contact: `${currentContact?.first_name || ''} ${currentContact?.last_name || currentContact?.phone || 'Unknown'}`.trim(),
      phone: currentContact?.phone,
      outcome: selectedOutcome,
      notes,
      time: new Date().toLocaleTimeString(),
    }
    setRecentOutcomes((prev) => [outcome, ...prev.slice(0, 9)])
    setSubmitted(true)
    setTimeout(() => {
      setSubmitted(false)
      setSelectedOutcome('')
      setNotes('')
    }, 2000)
  }

  const canSubmit = callStatus === 'ended' || callStatus === 'idle'

  return (
    <div className="flex flex-col h-full card-cyber rounded overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-neon-green border-opacity-10">
        <div className="terminal-header mb-0.5">Post-Call</div>
        <h3 className="text-text-terminal text-sm font-mono font-bold">LOG CALL OUTCOME</h3>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-cyber p-4 space-y-4">
        {/* Outcome buttons */}
        <div>
          <div className="terminal-header mb-2">Call Result</div>
          <StatusTagger selected={selectedOutcome} onSelect={setSelectedOutcome} />
        </div>

        {/* Notes */}
        <div>
          <div className="terminal-header mb-2">Notes</div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input-cyber w-full px-3 py-2 text-xs rounded-sm resize-none"
            rows={4}
            placeholder="Call notes, callback time, next steps..."
          />
        </div>

        {/* Submit */}
        <AnimatePresence mode="wait">
          {submitted ? (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-3 rounded-sm font-mono text-sm font-bold"
              style={{ background: 'rgba(0,255,102,0.1)', border: '1px solid rgba(0,255,102,0.4)', color: '#00ff66' }}
            >
              ✓ OUTCOME LOGGED
            </motion.div>
          ) : (
            <motion.button
              key="submit"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSubmit}
              disabled={!selectedOutcome}
              className="btn-cyber w-full py-3 text-xs font-bold rounded-sm"
              style={{ opacity: !selectedOutcome ? 0.4 : 1, cursor: !selectedOutcome ? 'not-allowed' : 'pointer' }}
            >
              ▶ SUBMIT LOG
            </motion.button>
          )}
        </AnimatePresence>

        {/* Recent outcomes */}
        {recentOutcomes.length > 0 && (
          <div>
            <div className="separator-neon" />
            <div className="terminal-header mb-2">Recent Outcomes</div>
            <div className="space-y-2">
              {recentOutcomes.map((o, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-sm"
                  style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(0,255,102,0.05)' }}>
                  <div className="min-w-0">
                    <div className="text-text-terminal text-xs font-mono truncate">{o.contact}</div>
                    <div className="text-text-muted text-xs font-mono" style={{ fontSize: '0.6rem' }}>{o.time}</div>
                  </div>
                  <span className="text-xs font-mono text-neon-dim ml-2 flex-shrink-0">
                    {o.outcome.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Dialer() {
  const [showAddModal, setShowAddModal] = useState(false)
  const { addToQueue } = useDialer()

  return (
    <div className="h-[calc(100vh-52px)] flex flex-col">
      {/* Page Header */}
      <div className="px-6 py-3 border-b border-neon-green border-opacity-10 flex items-center justify-between flex-shrink-0">
        <div>
          <div className="terminal-header">Call Center Interface</div>
          <h1 className="text-text-terminal text-lg font-mono font-bold" style={{ color: '#00ff66', textShadow: '0 0 10px #00ff66' }}>
            DIALER TERMINAL
          </h1>
        </div>
        <div className="text-text-muted text-xs font-mono" style={{ fontSize: '0.65rem' }}>
          HACKER509 by LH5 Leley Hacker 509
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-0 overflow-hidden">
        {/* LEFT: Queue */}
        <div className="border-r border-neon-green border-opacity-10 overflow-hidden flex flex-col p-3">
          <DialerQueue onAddContact={() => setShowAddModal(true)} />
        </div>

        {/* CENTER: Call Controls */}
        <div className="border-r border-neon-green border-opacity-10 overflow-hidden"
          style={{ background: 'radial-gradient(ellipse at center bottom, rgba(0,255,102,0.03) 0%, transparent 70%)' }}>
          <CallControls />
        </div>

        {/* RIGHT: Outcome + Audio */}
        <div className="overflow-y-auto scrollbar-cyber p-3 space-y-3">
          <OutcomePanel />
          <AudioProcessor />
        </div>
      </div>

      {/* Add Contact Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddContactModal
            onAdd={addToQueue}
            onClose={() => setShowAddModal(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
