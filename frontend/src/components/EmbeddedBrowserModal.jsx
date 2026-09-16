import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export default function EmbeddedBrowserModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('tps') // 'tps' | 'fps'
  const [loading, setLoading] = useState(true)
  const [iframeError, setIframeError] = useState(false)

  const tpsUrl = 'https://www.truepeoplesearch.com'
  const fpsUrl = 'https://www.fastpeoplesearch.com'

  const currentUrl = activeTab === 'tps' ? tpsUrl : fpsUrl

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      setIframeError(false)
    }
  }, [isOpen, activeTab])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0, 0, 0, 0.85)', backdropFilter: 'blur(6px)' }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="card-cyber w-full max-w-5xl h-[85vh] flex flex-col rounded overflow-hidden shadow-2xl"
          style={{ border: '1px solid rgba(0, 255, 102, 0.4)', boxShadow: '0 0 50px rgba(0, 255, 102, 0.15)' }}
        >
          {/* Top Browser Bar */}
          <div className="bg-black/90 px-4 py-2.5 border-b border-neon-green/20 flex items-center justify-between gap-3 flex-shrink-0">
            {/* Left Controls & Title */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onClose}
                  className="w-3 h-3 rounded-full bg-red-500 hover:brightness-125 transition-all"
                  title="Fermer"
                />
                <div className="w-3 h-3 rounded-full bg-yellow-500 opacity-60" />
                <div className="w-3 h-3 rounded-full bg-green-500 opacity-60" />
              </div>
              <div className="h-4 w-px bg-white/20" />
              <div className="terminal-header flex items-center gap-2">
                <span>NAVIGATEUR EMBARQUÉ — CONSULTATION MANUELLE</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-sm bg-neon-green/10 border border-neon-green/30 text-neon-green text-[0.65rem] font-mono">
                <span>SESSION LOCALE — AUCUN PROXY</span>
              </div>
              <button
                onClick={onClose}
                className="text-text-muted hover:text-neon-danger text-sm font-mono px-2 py-0.5"
              >
                ✕ FERMER
              </button>
            </div>
          </div>

          {/* Navigation & Address Bar */}
          <div className="bg-black/70 px-4 py-2 border-b border-white/10 flex items-center justify-between gap-3 flex-shrink-0">
            {/* Tabs */}
            <div className="flex items-center gap-1 bg-black/60 p-1 rounded border border-white/10">
              <button
                onClick={() => setActiveTab('tps')}
                className={`px-3 py-1 text-xs font-mono font-bold rounded-sm transition-all flex items-center gap-1.5 ${
                  activeTab === 'tps'
                    ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 shadow-[0_0_10px_rgba(0,212,255,0.3)]'
                    : 'text-text-muted hover:text-white'
                }`}
              >
                <span>🔎 TruePeopleSearch (TPS)</span>
              </button>
              <button
                onClick={() => setActiveTab('fps')}
                className={`px-3 py-1 text-xs font-mono font-bold rounded-sm transition-all flex items-center gap-1.5 ${
                  activeTab === 'fps'
                    ? 'bg-neon-warn/20 text-neon-warn border border-neon-warn/50 shadow-[0_0_10px_rgba(255,153,0,0.3)]'
                    : 'text-text-muted hover:text-white'
                }`}
              >
                <span>⚡ FastPeopleSearch (FPS)</span>
              </button>
            </div>

            {/* Address Bar */}
            <div className="flex-1 flex items-center gap-2 bg-black/80 border border-white/15 px-3 py-1 rounded text-xs font-mono text-text-muted truncate">
              <span className="text-neon-green">🔒 https://</span>
              <span className="truncate text-white/90">{currentUrl.replace('https://', '')}</span>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLoading(true)}
                className="px-2.5 py-1 text-xs font-mono bg-white/5 hover:bg-white/10 border border-white/15 rounded text-white transition-colors"
                title="Actualiser"
              >
                ⟳ ACTUALISER
              </button>
              <a
                href={currentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1 text-xs font-mono bg-neon-cyan/10 border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/20 rounded transition-colors"
                title="Ouvrir dans un nouvel onglet"
              >
                ↗ ONGLET EXTERNE
              </a>
            </div>
          </div>

          {/* Main Content / Iframe Frame */}
          <div className="flex-1 relative bg-black/95 overflow-hidden flex flex-col items-center justify-center">
            {loading && (
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                <div className="w-8 h-8 border-2 border-neon-green border-t-transparent rounded-full animate-spin" />
                <div className="text-neon-green text-xs font-mono">CHARGEMENT DU SITE EXTERNE...</div>
              </div>
            )}

            <iframe
              src={currentUrl}
              title="External site"
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              onLoad={() => setLoading(false)}
              onError={() => {
                setLoading(false)
                setIframeError(true)
              }}
            />

            {/* Direct fallback preview container if site blocks iframe embedding */}
            {iframeError && (
              <div className="absolute inset-0 bg-black/95 z-20 flex flex-col items-center justify-center p-6 text-center space-y-4">
                <div className="text-3xl">🛡️</div>
                <div className="text-neon-warn font-mono font-bold text-sm">
                  LE SITE NE PERMET PAS L'AFFICHAGE EMBARQUÉ
                </div>
                <div className="text-text-muted font-mono text-xs max-w-md">
                  Ouvrez le site dans un onglet externe pour une consultation manuelle. Aucun numéro ou contact de l'application n'est transmis automatiquement.
                </div>
                <div className="flex gap-3 pt-2">
                  <a
                    href={tpsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-cyber px-4 py-2.5 text-xs font-bold rounded-sm border-neon-cyan text-neon-cyan"
                  >
                    🔎 OUVRIR TRUEPEOPLESEARCH
                  </a>
                  <a
                    href={fpsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-cyber px-4 py-2.5 text-xs font-bold rounded-sm border-neon-warn text-neon-warn"
                  >
                    ⚡ OUVRIR FASTPEOPLESEARCH
                  </a>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
