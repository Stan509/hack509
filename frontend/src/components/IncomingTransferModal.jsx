import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDialer } from '../contexts/DialerContext.jsx'
import { callAudio } from '../utils/callAudio.js'

export default function IncomingTransferModal() {
  const { api, isAuthenticated, user } = useAuth()
  const { setCurrentContact, setCallStatus, callStatus } = useDialer()
  const navigate = useNavigate()

  const [activeTransfer, setActiveTransfer] = useState(null)
  const [isAccepting, setIsAccepting] = useState(false)
  const [isRejecting, setIsRejecting] = useState(false)
  const pollTimerRef = useRef(null)
  const activeTransferIdRef = useRef(null)

  // Keep ref in sync
  useEffect(() => {
    activeTransferIdRef.current = activeTransfer?.id || null
  }, [activeTransfer])

  // Polling for pending transfers
  useEffect(() => {
    if (!isAuthenticated || !api) {
      if (activeTransfer) {
        callAudio.stopIncomingCallRing()
        setActiveTransfer(null)
      }
      return
    }

    const checkPendingTransfers = async () => {
      try {
        const res = await api.get('/api/calls/transfers/pending/')
        const transfers = res.data?.transfers || []

        if (transfers.length > 0) {
          const latest = transfers[0]
          if (activeTransferIdRef.current !== latest.id) {
            setActiveTransfer(latest)
            // Lancer la sonnerie d'appel immédiatement !
            callAudio.startIncomingCallRing()
          }
        } else {
          // Plus aucun transfert en attente
          if (activeTransferIdRef.current) {
            callAudio.stopIncomingCallRing()
            setActiveTransfer(null)
          }
        }
      } catch (err) {
        // Silent fail on polling errors
      }
    }

    // Check immediately then poll every 2.5 seconds
    checkPendingTransfers()
    pollTimerRef.current = setInterval(checkPendingTransfers, 2500)

    return () => {
      clearInterval(pollTimerRef.current)
      callAudio.stopIncomingCallRing()
    }
  }, [isAuthenticated, api])

  const handleAccept = async () => {
    if (!activeTransfer || isAccepting) return
    setIsAccepting(true)
    callAudio.stopIncomingCallRing()

    try {
      await api.post(`/api/calls/transfers/${activeTransfer.id}/accept/`)
      
      const newContact = {
        id: activeTransfer.contact_id || Date.now(),
        phone: activeTransfer.phone,
        first_name: activeTransfer.contact_name || 'Client transféré',
        name: activeTransfer.contact_name || 'Client transféré',
      }

      setCurrentContact(newContact)
      setCallStatus('active')
      
      // Navigate to dialer view
      navigate('/dialer')
      setActiveTransfer(null)
    } catch (err) {
      console.error('Accept transfer error:', err)
      setActiveTransfer(null)
    } finally {
      setIsAccepting(false)
    }
  }

  const handleReject = async () => {
    if (!activeTransfer || isRejecting) return
    setIsRejecting(true)
    callAudio.stopIncomingCallRing()

    try {
      await api.post(`/api/calls/transfers/${activeTransfer.id}/reject/`)
    } catch (err) {
      console.warn('Reject transfer error:', err)
    } finally {
      setIsRejecting(false)
      setActiveTransfer(null)
    }
  }

  if (!activeTransfer) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.85, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.85, y: 20 }}
          className="card-cyber w-full max-w-md rounded-lg overflow-hidden border-2 border-neon-green shadow-2xl p-6 relative"
          style={{
            boxShadow: '0 0 40px rgba(0, 255, 102, 0.4), inset 0 0 20px rgba(0, 255, 102, 0.1)',
            background: '#0a0d0a',
          }}
        >
          {/* Animated Pulsing Ring Banner */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-3xl animate-bounce">🔔</span>
            <div className="text-center">
              <span className="text-xs font-mono font-bold uppercase tracking-widest text-neon-warn bg-neon-warn/15 px-2.5 py-1 rounded border border-neon-warn/40 inline-block animate-pulse">
                SONNERIE EN COURS...
              </span>
              <h2 className="text-xl font-mono font-black text-neon-green tracking-wide mt-1 drop-shadow-[0_0_10px_#00ff66]">
                APPEL ENTRANT TRANSFÉRÉ
              </h2>
            </div>
          </div>

          {/* Transfer Info */}
          <div className="bg-black/80 border border-white/15 rounded p-4 mb-6 space-y-3 font-mono text-sm">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-text-muted text-xs">Transféré par :</span>
              <span className="text-neon-cyan font-bold">
                {activeTransfer.from_operator_name}
              </span>
            </div>

            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span className="text-text-muted text-xs">Client :</span>
              <span className="text-white font-bold">
                {activeTransfer.contact_name || 'Client'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-text-muted text-xs">Téléphone :</span>
              <span className="text-neon-green font-bold text-base tracking-wider">
                {activeTransfer.phone}
              </span>
            </div>

            {activeTransfer.is_broadcast && (
              <div className="text-[0.7rem] text-center text-neon-warn bg-neon-warn/10 p-1.5 rounded border border-neon-warn/30">
                📡 Appel diffusé à tous les opérateurs — Le premier qui décroche prend la main !
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {/* DÉCROCHER */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleAccept}
              disabled={isAccepting}
              className="py-3 px-4 rounded font-mono font-bold text-sm bg-neon-green/20 hover:bg-neon-green/30 border-2 border-neon-green text-neon-green flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(0,255,102,0.35)] transition-all"
            >
              <span className="text-lg">📞</span>
              <span>{isAccepting ? 'CONNEXION...' : 'DÉCROCHER'}</span>
            </motion.button>

            {/* REFUSER */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleReject}
              disabled={isRejecting}
              className="py-3 px-4 rounded font-mono font-bold text-sm bg-neon-danger/20 hover:bg-neon-danger/30 border-2 border-neon-danger text-neon-danger flex items-center justify-center gap-2 cursor-pointer shadow-[0_0_15px_rgba(255,34,68,0.25)] transition-all"
            >
              <span>✕</span>
              <span>{isRejecting ? 'REFUS...' : 'REFUSER'}</span>
            </motion.button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
