import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { useDialer } from '../contexts/DialerContext.jsx'
import useTelephony from '../hooks/useTelephony.js'
import EmbeddedBrowserModal from './EmbeddedBrowserModal.jsx'
import OperatorTransferModal from './OperatorTransferModal.jsx'

function VUBars({ active }) {

  const numBars = 8
  return (
    <div className="flex items-end gap-1 h-8">
      {Array.from({ length: numBars }).map((_, i) => (
        <motion.div
          key={i}
          animate={active ? {
            height: [`${20 + Math.random() * 60}%`, `${20 + Math.random() * 80}%`, `${20 + Math.random() * 40}%`],
          } : { height: '15%' }}
          transition={active ? {
            duration: 0.3 + Math.random() * 0.4,
            repeat: Infinity,
            repeatType: 'mirror',
            delay: i * 0.07,
          } : { duration: 0.3 }}
          style={{
            width: '6px',
            background: active ? '#00ff66' : '#1a1a1a',
            boxShadow: active ? '0 0 4px #00ff66' : 'none',
            borderRadius: '1px',
          }}
        />
      ))}
    </div>
  )
}

const STATUS_DISPLAY = {
  idle:     { label: 'STANDBY',  color: '#3d5a3d', pulse: false },
  dialing:  { label: 'DIALING', color: '#ff9900', pulse: true },
  ringing:  { label: 'RINGING', color: '#ff9900', pulse: true },
  active:   { label: 'LIVE CALL', color: '#00ff66', pulse: true },
  holding:  { label: 'ON HOLD', color: '#00d4ff', pulse: false },
  ended:    { label: 'CALL ENDED', color: '#ff2244', pulse: false },
}

export default function CallControls() {
  const { currentContact, callStatus, callTimer, formatTimer, dialNext, hangUp, queue, autoDial, setAutoDial, toggleFavoriteContact, ringTimeout, setRingTimeout, ringTimer, ringTimeoutActive } = useDialer()
  const { makeCall, hangup, hold, mute, isMuted, isOnHold, isReady, simulationMode, error, providerType, switchProvider } = useTelephony()

  const [browserOpen, setBrowserOpen] = useState(false)
  const [browserTarget, setBrowserTarget] = useState('tps')
  const [browserToast, setBrowserToast] = useState('')
  const [transferModalOpen, setTransferModalOpen] = useState(false)

  const handleOpenSearch = async (target) => {
    setBrowserTarget(target)
    const phone = currentContact?.phone || ''
    const siteLabel = target === 'fps' ? 'FPS' : 'TPS'
    if (phone) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(phone)
          setBrowserToast(`Numéro copié — collez-le dans la recherche ${siteLabel}`)
        }
      } catch {
        // Handled in modal
      }
    }
    setBrowserOpen(true)
    setTimeout(() => setBrowserToast(''), 5000)
  }

  const handleInitiateTransfer = (op, data) => {
    // Put current call on hold during transfer
    if (!isOnHold && hold) {
      hold()
    }
  }

  const statusCfg = STATUS_DISPLAY[callStatus] || STATUS_DISPLAY.idle
  const isCallActive = callStatus === 'active' || callStatus === 'holding'
  const isInProgress = callStatus !== 'idle' && callStatus !== 'ended'

  const lastCalledContactId = useRef(null)

  // Automatically trigger Twilio call when currentContact changes or callStatus becomes 'dialing'
  useEffect(() => {
    if (callStatus === 'dialing' && currentContact?.phone) {
      if (lastCalledContactId.current !== currentContact.id) {
        lastCalledContactId.current = currentContact.id
        makeCall(currentContact.phone)
      }
    }
  }, [callStatus, currentContact, makeCall])

  const handleDial = () => {
    if (currentContact?.phone) {
      makeCall(currentContact.phone)
    } else {
      const next = dialNext()
      if (next?.phone) makeCall(next.phone)
    }
  }

  const handleHangup = () => {
    hangup()
    hangUp()
  }

  return (
    <div className="flex flex-col h-full items-center justify-between py-6 px-4">
      {/* Status Header */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="terminal-header">Active Call</div>
          <div className="flex items-center gap-2">
            {/* Ringing Timeout Selector */}
            <div className="flex items-center gap-1 text-xs font-mono text-text-muted" title="Temps max de sonnerie avant de déclarer le numéro non attribué">
              <span>⏱</span>
              <select
                value={ringTimeout}
                onChange={(e) => setRingTimeout(Number(e.target.value))}
                className="input-cyber text-xs rounded-sm px-1 py-0.5"
                style={{ background: '#080808', borderColor: 'rgba(0,255,102,0.3)', color: '#00ff66' }}
              >
                <option value={5}>5s</option>
                <option value={10}>10s</option>
                <option value={12}>12s</option>
                <option value={15}>15s</option>
                <option value={20}>20s</option>
              </select>
            </div>

            <button
              onClick={() => setAutoDial(!autoDial)}
              className="text-xs font-mono px-2 py-0.5 rounded-sm border transition-all cursor-pointer hover:brightness-125"
              style={{
                borderColor: autoDial ? '#00ff66' : '#6b7280',
                color: autoDial ? '#00ff66' : '#6b7280',
                background: autoDial ? 'rgba(0,255,102,0.12)' : 'rgba(107,114,128,0.1)',
                boxShadow: autoDial ? '0 0 8px rgba(0,255,102,0.2)' : 'none',
              }}
              title="Activer/Désactiver l'appel automatique suivant dans la file d'attente"
            >
              {autoDial ? '⚡ AUTO-NEXT: ON' : '⏸ AUTO-NEXT: OFF'}
            </button>

            {simulationMode && (
              <span className="text-xs font-mono text-neon-warn px-2 py-0.5 rounded-sm"
                style={{ background: 'rgba(255,153,0,0.1)', border: '1px solid rgba(255,153,0,0.3)' }}>
                SIM MODE
              </span>
            )}
          </div>
        </div>

        {/* Error notification banner */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full text-center p-2 mb-3 rounded text-xs font-mono text-neon-danger border border-neon-danger flex items-center justify-between"
            style={{ background: 'rgba(255,34,68,0.15)', boxShadow: '0 0 12px rgba(255,34,68,0.3)' }}
          >
            <span>⚠️ {providerType === 'asterisk' ? 'SIP / ASTERISK' : 'TWILIO'}: {error}</span>
            <button onClick={handleHangup} className="text-[0.65rem] underline font-bold hover:text-white">RÉINITIALISER</button>
          </motion.div>
        )}

        {/* Status indicator */}
        <div className="flex items-center justify-center gap-3 mb-6">
          <motion.div
            animate={statusCfg.pulse ? { scale: [1, 1.2, 1], opacity: [1, 0.7, 1] } : { scale: 1 }}
            transition={{ duration: 1, repeat: Infinity }}
            className="w-4 h-4 rounded-full"
            style={{
              background: statusCfg.color,
              boxShadow: `0 0 12px ${statusCfg.color}, 0 0 24px ${statusCfg.color}44`,
            }}
          />
          <span
            className="text-sm font-mono font-bold tracking-widest"
            style={{ color: statusCfg.color, textShadow: `0 0 10px ${statusCfg.color}` }}
          >
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* Contact display */}
      <div className="text-center flex-1 flex flex-col items-center justify-center">
        {currentContact ? (
          <motion.div
            key={currentContact.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            {/* Avatar */}
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-4xl font-mono font-bold mx-auto mb-4"
              style={{
                background: 'rgba(0,255,102,0.1)',
                border: `2px solid ${isCallActive ? '#00ff66' : 'rgba(0,255,102,0.3)'}`,
                boxShadow: isCallActive ? '0 0 20px rgba(0,255,102,0.4), 0 0 40px rgba(0,255,102,0.2)' : '0 0 10px rgba(0,255,102,0.1)',
                color: '#00ff66',
              }}
            >
              {(currentContact.first_name?.[0] || currentContact.name?.[0] || '?').toUpperCase()}
            </div>

            <div
              className="text-2xl font-mono font-bold mb-1"
              style={{ color: '#00ff66', textShadow: '0 0 15px #00ff66' }}
            >
              {currentContact.first_name} {currentContact.last_name || currentContact.name}
            </div>
            <div className="text-text-muted font-mono text-lg tracking-widest mb-2 flex items-center justify-center gap-2 flex-wrap">
              <span>{currentContact.phone}</span>
              <button
                onClick={() => toggleFavoriteContact(currentContact)}
                className="text-xs font-mono px-2 py-0.5 rounded-sm border transition-all cursor-pointer hover:brightness-125"
                style={{
                  borderColor: currentContact.is_favorite ? '#ffcc00' : 'rgba(255,204,0,0.4)',
                  color: currentContact.is_favorite ? '#ffcc00' : '#888',
                  background: currentContact.is_favorite ? 'rgba(255,204,0,0.15)' : 'transparent',
                  boxShadow: currentContact.is_favorite ? '0 0 10px rgba(255,204,0,0.3)' : 'none',
                }}
                title={currentContact.is_favorite ? "Retirer des favoris" : "Ajouter aux favoris"}
              >
                {currentContact.is_favorite ? '⭐ FAVORIS' : '☆ AJOUTER FAVORIS'}
              </button>
            </div>

            {/* Separate TPS & FPS Lookup Buttons */}
            <div className="flex flex-col items-center justify-center gap-1.5 mb-3">
              <div className="flex items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenSearch('tps')}
                  className="px-3 py-1 text-xs font-mono rounded-sm border border-neon-cyan/60 text-neon-cyan bg-neon-cyan/10 hover:bg-neon-cyan/20 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Ouvrir TruePeopleSearch dans le navigateur embarqué"
                >
                  <span>🔎 TPS</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenSearch('fps')}
                  className="px-3 py-1 text-xs font-mono rounded-sm border border-neon-warn/60 text-neon-warn bg-neon-warn/10 hover:bg-neon-warn/20 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Ouvrir FastPeopleSearch dans le navigateur embarqué"
                >
                  <span>⚡ FPS</span>
                </button>
              </div>
              {browserToast && (
                <div className="text-[0.65rem] font-mono text-neon-green animate-pulse">
                  ✓ {browserToast}
                </div>
              )}
            </div>

            {/* Timer */}
            {isCallActive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-neon-warn font-mono text-xl font-bold tracking-widest"
                style={{ textShadow: '0 0 10px #ff9900' }}
              >
                {formatTimer(callTimer)}
              </motion.div>
            )}

            {/* Ringing Timeout Countdown */}
            {ringTimeoutActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-neon-danger font-mono text-xs font-bold tracking-widest mt-1.5 px-3 py-1 rounded-sm border inline-block"
                style={{ background: 'rgba(255,34,68,0.1)', borderColor: 'rgba(255,34,68,0.3)', color: '#ff2244' }}
              >
                ⏱ SONNERIE TIMEOUT: {ringTimer}s
              </motion.div>
            )}

            {/* VU Bars */}
            <div className="flex justify-center mt-3">
              <VUBars active={isCallActive && !isMuted} />
            </div>
          </motion.div>
        ) : (
          <div className="text-center">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mx-auto mb-4"
              style={{ background: 'rgba(61,90,61,0.1)', border: '2px solid rgba(61,90,61,0.3)', color: '#3d5a3d' }}
            >
              ☎
            </div>
            <div className="text-text-muted font-mono text-sm tracking-wider">NO ACTIVE CONTACT</div>
            <div className="text-text-muted font-mono text-xs mt-1 opacity-50">
              {queue.length > 0 ? `${queue.length} contacts queued` : 'Queue is empty'}
            </div>
          </div>
        )}
      </div>

      {/* Call Controls */}
      <div className="w-full space-y-3">
        {/* Main controls grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* DIAL / NEXT */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleDial}
            disabled={isInProgress}
            className="btn-cyber py-3 text-sm rounded font-bold"
            style={{
              opacity: isInProgress ? 0.4 : 1,
              cursor: isInProgress ? 'not-allowed' : 'pointer',
            }}
          >
            📞 DIAL
          </motion.button>

          {/* HANGUP */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleHangup}
            className="btn-cyber btn-danger py-3 text-sm rounded font-bold"
          >
            ☎ HANGUP
          </motion.button>
        </div>

        {/* Secondary controls */}
        <div className="grid grid-cols-2 gap-2">
          {/* MUTE */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => mute()}
            disabled={!isCallActive}
            className="btn-cyber py-2 text-xs rounded"
            style={{
              opacity: !isCallActive ? 0.4 : 1,
              borderColor: isMuted ? '#ff2244' : undefined,
              color: isMuted ? '#ff2244' : undefined,
              background: isMuted ? 'rgba(255,34,68,0.1)' : undefined,
              boxShadow: isMuted ? '0 0 8px rgba(255,34,68,0.4)' : undefined,
            }}
          >
            {isMuted ? '🔇 MUTED' : '🔊 MUTE'}
          </motion.button>

          {/* HOLD */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={hold}
            disabled={!isCallActive}
            className="btn-cyber py-2 text-xs rounded"
            style={{
              opacity: !isCallActive ? 0.4 : 1,
              borderColor: isOnHold ? '#00d4ff' : undefined,
              color: isOnHold ? '#00d4ff' : undefined,
              background: isOnHold ? 'rgba(0,212,255,0.1)' : undefined,
              boxShadow: isOnHold ? '0 0 8px rgba(0,212,255,0.4)' : undefined,
            }}
          >
            {isOnHold ? '▶ UNHOLD' : '⏸ HOLD'}
          </motion.button>
        </div>

        {/* IN-CALL OPERATOR TRANSFER BUTTON */}
        <div className="mt-2.5">
          <motion.button
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setTransferModalOpen(true)}
            disabled={!isCallActive && !isInProgress}
            className="w-full py-2 text-xs font-mono font-bold rounded flex items-center justify-center gap-2 transition-all cursor-pointer"
            style={{
              opacity: !isCallActive && !isInProgress ? 0.35 : 1,
              borderColor: '#00d4ff',
              color: '#00d4ff',
              background: 'rgba(0, 212, 255, 0.12)',
              border: '1px solid rgba(0, 212, 255, 0.5)',
              boxShadow: '0 0 12px rgba(0, 212, 255, 0.25)',
            }}
          >
            <span>🔀</span>
            <span>TRANSFÉRER L'APPEL VERS UN AUTRE OPÉRATEUR</span>
          </motion.button>
        </div>

        {/* Provider readiness & Engine Swapper */}
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-white/10 mt-2">
          <div className="flex items-center gap-2">
            <span
              className="status-dot"
              style={{
                background: isReady ? '#00ff66' : '#ff2244',
                boxShadow: `0 0 6px ${isReady ? '#00ff66' : '#ff2244'}`,
              }}
            />
            <span className="text-xs font-mono text-text-muted" style={{ fontSize: '0.65rem' }}>
              MOTEUR: <strong className="text-white">{providerType ? providerType.toUpperCase() : 'TWILIO'}</strong> ({isReady ? 'READY' : 'OFFLINE'})
            </span>
          </div>

          <button
            onClick={() => switchProvider()}
            className="px-2.5 py-1 text-[0.65rem] font-mono font-bold rounded border transition-all flex items-center gap-1.5 hover:brightness-125 cursor-pointer"
            style={{
              borderColor: providerType === 'asterisk' ? '#00d4ff' : '#00ff66',
              color: providerType === 'asterisk' ? '#00d4ff' : '#00ff66',
              background: providerType === 'asterisk' ? 'rgba(0,212,255,0.12)' : 'rgba(0,255,102,0.12)',
              boxShadow: `0 0 10px ${providerType === 'asterisk' ? 'rgba(0,212,255,0.2)' : 'rgba(0,255,102,0.2)'}`
            }}
            title="Changer de fournisseur d'appel entre Twilio et Asterisk PBX"
          >
            <span>🔄 CHANGER :</span>
            <span>{providerType === 'asterisk' ? '📞 ASTERISK (SIP)' : '⚡ TWILIO'}</span>
          </button>
        </div>

      </div>

      {/* Embedded Chromium Browser Modal */}
      {currentContact && (
        <EmbeddedBrowserModal
          isOpen={browserOpen}
          onClose={() => setBrowserOpen(false)}
          initialTarget={browserTarget}
          initialPhone={currentContact.phone}
          contactName={`${currentContact.first_name || ''} ${currentContact.last_name || ''}`}
        />
      )}

      {/* Operator Transfer Modal */}
      <OperatorTransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        currentContact={currentContact}
        onInitiateTransfer={handleInitiateTransfer}
      />
    </div>
  )
}
