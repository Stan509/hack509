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
  idle:     { label: 'DISPONIBLE',  color: '#3d5a3d', pulse: false },
  dialing:  { label: 'COMPOSITION...', color: '#ff9900', pulse: true },
  ringing:  { label: 'SONNERIE...', color: '#ff9900', pulse: true },
  active:   { label: 'APPEL EN COURS', color: '#00ff66', pulse: true },
  holding:  { label: 'EN ATTENTE (HOLD)', color: '#00d4ff', pulse: true },
  ended:    { label: 'APPEL TERMINÉ', color: '#ff2244', pulse: false },
}

export default function CallControls() {
  const { currentContact, callStatus, setCallStatus, callTimer, formatTimer, dialNext, hangUp, queue, autoDial, setAutoDial, toggleFavoriteContact, ringTimeout, setRingTimeout, ringTimer, ringTimeoutActive } = useDialer()
  const { makeCall, hangup, hold, mute, isMuted, isOnHold, isReady, simulationMode, error, clearError, providerType, switchProvider, callStatus: telephonyCallStatus, activeCall } = useTelephony()

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

  // Sync telephony call state with dialer
  useEffect(() => {
    if (telephonyCallStatus === 'active') {
      setCallStatus('active')
    } else if (telephonyCallStatus === 'holding') {
      setCallStatus('holding')
    } else if (telephonyCallStatus === 'ringing') {
      setCallStatus('ringing')
    } else if (telephonyCallStatus === 'ended') {
      setCallStatus('ended')
    } else if (telephonyCallStatus === 'idle' && (callStatus === 'active' || callStatus === 'holding')) {
      handleHangup()
    }
  }, [telephonyCallStatus])

  // If isOnHold toggles, ensure dialer status reflects it
  useEffect(() => {
    if (isOnHold && callStatus === 'active') {
      setCallStatus('holding')
    } else if (!isOnHold && callStatus === 'holding') {
      setCallStatus('active')
    }
  }, [isOnHold])

  const effectiveStatus = (telephonyCallStatus && telephonyCallStatus !== 'idle') ? telephonyCallStatus : callStatus
  const statusCfg = STATUS_DISPLAY[effectiveStatus] || STATUS_DISPLAY.idle
  const isCallActive = callStatus === 'active' || callStatus === 'holding' || telephonyCallStatus === 'active' || telephonyCallStatus === 'holding' || isOnHold
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
    if (clearError) clearError()
    hangup()
    hangUp()
  }

  return (
    <div className="flex flex-col h-full items-center justify-between py-2.5 md:py-6 px-3 md:px-4 overflow-y-auto scrollbar-cyber w-full">
      {/* Status Header */}
      <div className="w-full">
        <div className="flex items-center justify-between mb-2 md:mb-4 flex-wrap gap-2">
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
            className="w-full p-2.5 mb-3 rounded text-xs font-mono text-neon-danger border border-neon-danger flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
            style={{ background: 'rgba(255,34,68,0.15)', boxShadow: '0 0 12px rgba(255,34,68,0.3)' }}
          >
            <div className="flex-1 pr-2">
              <span className="font-bold">⚠️ {providerType === 'asterisk' ? 'SIP / ASTERISK' : 'TWILIO'}:</span> {error}
            </div>
            <div className="flex items-center gap-2 flex-wrap shrink-0">
              {providerType === 'twilio' && (
                <button
                  type="button"
                  onClick={() => switchProvider('asterisk')}
                  className="px-2 py-0.5 rounded text-[0.7rem] font-bold border border-neon-cyan text-neon-cyan bg-neon-cyan/10 hover:bg-neon-cyan/20 transition-all cursor-pointer"
                  title="Basculer instantanément sur Asterisk SIP"
                >
                  BASCULER SUR SIP
                </button>
              )}
              {providerType === 'asterisk' && (
                <button
                  type="button"
                  onClick={() => switchProvider('twilio')}
                  className="px-2 py-0.5 rounded text-[0.7rem] font-bold border border-neon-green text-neon-green bg-neon-green/10 hover:bg-neon-green/20 transition-all cursor-pointer"
                  title="Basculer instantanément sur Twilio Voice"
                >
                  BASCULER SUR TWILIO
                </button>
              )}
              <button
                type="button"
                onClick={handleHangup}
                className="px-2 py-0.5 rounded text-[0.7rem] font-bold border border-red-500/50 text-white bg-red-500/20 hover:bg-red-500/40 transition-all cursor-pointer"
              >
                RÉINITIALISER
              </button>
            </div>
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
              className="w-14 h-14 md:w-20 md:h-20 rounded-full flex items-center justify-center text-2xl md:text-4xl font-mono font-bold mx-auto mb-2 md:mb-4"
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
              className="text-lg md:text-2xl font-mono font-bold mb-0.5 md:mb-1"
              style={{ color: '#00ff66', textShadow: '0 0 15px #00ff66' }}
            >
              {currentContact.first_name} {currentContact.last_name || currentContact.name}
            </div>
            <div className="text-text-muted font-mono text-sm md:text-lg tracking-widest mb-1.5 md:mb-2 flex items-center justify-center gap-2 flex-wrap">
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

            {/* Call Timer Display */}
            {isCallActive && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-2 mb-1 px-4 py-2 rounded border font-mono flex items-center justify-center gap-3"
                style={{
                  background: 'rgba(0, 255, 102, 0.08)',
                  borderColor: 'rgba(0, 255, 102, 0.4)',
                  boxShadow: '0 0 15px rgba(0, 255, 102, 0.15)',
                }}
              >
                <span className="w-2.5 h-2.5 rounded-full bg-neon-green animate-pulse" />
                <span className="text-xs text-text-muted tracking-wider uppercase">TEMPS D'APPEL:</span>
                <span
                  className="text-2xl font-bold tracking-widest"
                  style={{ color: '#00ff66', textShadow: '0 0 12px rgba(0, 255, 102, 0.6)' }}
                >
                  {formatTimer(callTimer)}
                </span>
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
            className="btn-cyber py-2.5 text-xs rounded font-mono font-bold flex items-center justify-center gap-1.5 transition-all"
            style={{
              opacity: !isCallActive ? 0.35 : 1,
              cursor: !isCallActive ? 'not-allowed' : 'pointer',
              borderColor: isMuted ? '#ff2244' : undefined,
              color: isMuted ? '#ff2244' : undefined,
              background: isMuted ? 'rgba(255,34,68,0.15)' : undefined,
              boxShadow: isMuted ? '0 0 10px rgba(255,34,68,0.4)' : undefined,
            }}
          >
            <span>{isMuted ? '🔇' : '🎤'}</span>
            <span>{isMuted ? 'MUET (MUTED)' : 'MUTE'}</span>
          </motion.button>

          {/* HOLD */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={hold}
            disabled={!isCallActive}
            className="btn-cyber py-2.5 text-xs rounded font-mono font-bold flex items-center justify-center gap-1.5 transition-all"
            style={{
              opacity: !isCallActive ? 0.35 : 1,
              cursor: !isCallActive ? 'not-allowed' : 'pointer',
              borderColor: isOnHold ? '#00d4ff' : undefined,
              color: isOnHold ? '#00d4ff' : undefined,
              background: isOnHold ? 'rgba(0,212,255,0.15)' : undefined,
              boxShadow: isOnHold ? '0 0 12px rgba(0,212,255,0.4)' : undefined,
            }}
          >
            <span>{isOnHold ? '▶' : '⏸'}</span>
            <span>{isOnHold ? 'REPRENDRE' : 'EN ATTENTE'}</span>
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
        callSid={activeCall?.parameters?.CallSid || activeCall?.sid || ''}
        onInitiateTransfer={handleInitiateTransfer}
      />
    </div>
  )
}
