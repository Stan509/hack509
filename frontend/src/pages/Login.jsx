import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import MatrixRain from '../components/MatrixRain.jsx'

const ASCII_LOGO = `
██╗  ██╗ █████╗  ██████╗██╗  ██╗███████╗██████╗ ███████╗ ██████╗  █████╗ 
██║  ██║██╔══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗██╔════╝██╔═══██╗██╔══██╗
███████║███████║██║     █████╔╝ █████╗  ██████╔╝███████╗██║   ██║╚██████║
██╔══██║██╔══██║██║     ██╔═██╗ ██╔══╝  ██╔══██╗╚════██║██║   ██║ ╚═══██║
██║  ██║██║  ██║╚██████╗██║  ██╗███████╗██║  ██║███████║╚██████╔╝ █████╔╝
╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚══════╝ ╚═════╝  ╚════╝ 
`

function TypingCursor() {
  return (
    <span
      className="inline-block w-2 h-4 bg-neon-green ml-0.5 align-middle"
      style={{ animation: 'typing-cursor 1s step-end infinite', boxShadow: '0 0 6px #00ff66' }}
    />
  )
}

function ScanLine() {
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '2px',
        background: 'linear-gradient(90deg, transparent, rgba(0,255,102,0.3), transparent)',
        animation: 'scan-line 4s linear infinite',
        pointerEvents: 'none',
        zIndex: 10,
      }}
    />
  )
}

export default function Login() {
  const { login, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLogging, setIsLogging] = useState(false)
  const [error, setError] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [bootLines, setBootLines] = useState([])
  const [bootDone, setBootDone] = useState(false)

  const BOOT_SEQUENCE = [
    '> INITIALIZING HACKER509 SYSTEM...',
    '> LOADING CALL CENTER MODULES... [OK]',
    '> ESTABLISHING SECURE TUNNEL... [OK]',
    '> TWILIO GATEWAY STANDBY... [READY]',
    '> DIALER ENGINE LOADED... [OK]',
    '> SYSTEM READY. AUTHENTICATE TO PROCEED.',
  ]

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true })
  }, [isAuthenticated])

  useEffect(() => {
    let i = 0
    const interval = setInterval(() => {
      if (i < BOOT_SEQUENCE.length) {
        setBootLines((prev) => [...prev, BOOT_SEQUENCE[i]])
        i++
      } else {
        clearInterval(interval)
        setTimeout(() => setBootDone(true), 400)
      }
    }, 300)
    return () => clearInterval(interval)
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!username.trim() || !password) return
    setError('')
    setIsLogging(true)
    const result = await login(username.trim(), password)
    setIsLogging(false)
    if (result.success) {
      navigate('/')
    } else {
      setError(result.error || 'ACCESS DENIED — INVALID CREDENTIALS')
    }
  }

  return (
    <div className="min-h-screen bg-bg-primary flex items-center justify-center relative overflow-hidden">
      {/* Matrix Rain Background */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
        <MatrixRain opacity={0.35} />
      </div>

      {/* Scan line */}
      <ScanLine />

      {/* Dark overlay gradient */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(0,20,8,0.7) 0%, rgba(5,5,5,0.92) 100%)',
          zIndex: 1,
        }}
      />

      {/* Login Panel */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-lg mx-4"
        style={{
          background: 'rgba(10,10,10,0.95)',
          border: '1px solid rgba(0,255,102,0.3)',
          boxShadow: '0 0 40px rgba(0,255,102,0.15), 0 0 80px rgba(0,255,102,0.05), inset 0 0 40px rgba(0,0,0,0.5)',
        }}
      >
        {/* Corner decorations */}
        <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-neon-green" style={{ boxShadow: '0 0 8px #00ff66' }} />
        <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-neon-green" style={{ boxShadow: '0 0 8px #00ff66' }} />
        <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-neon-green" style={{ boxShadow: '0 0 8px #00ff66' }} />
        <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-neon-green" style={{ boxShadow: '0 0 8px #00ff66' }} />

        <div className="p-8">
          {/* ASCII Logo */}
          <div className="text-center mb-6">
            <pre
              className="text-neon-green font-mono overflow-hidden"
              style={{
                fontSize: 'clamp(3px, 1.1vw, 7px)',
                lineHeight: 1.2,
                textShadow: '0 0 6px #00ff66',
                letterSpacing: '0.02em',
              }}
            >
              {ASCII_LOGO}
            </pre>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-2"
            >
              <div
                className="text-sm font-mono tracking-widest font-bold"
                style={{ color: '#00ff66', textShadow: '0 0 15px #00ff66, 0 0 30px rgba(0,255,102,0.4)' }}
              >
                [ SYSTEM ACCESS TERMINAL ]
              </div>
              <div className="text-neon-dim text-xs font-mono tracking-wider mt-1 opacity-70">
                by LH5 Leley Hacker 509
              </div>
            </motion.div>
          </div>

          {/* Boot sequence */}
          <div
            className="mb-6 p-3 rounded-sm font-mono text-xs"
            style={{
              background: 'rgba(0,0,0,0.6)',
              border: '1px solid rgba(0,255,102,0.1)',
              minHeight: '120px',
            }}
          >
            <AnimatePresence>
              {bootLines.map((line, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="text-neon-dim mb-0.5"
                  style={{ fontSize: '0.7rem' }}
                >
                  {line}
                </motion.div>
              ))}
            </AnimatePresence>
            {!bootDone && <TypingCursor />}
          </div>

          {/* Login Form */}
          <AnimatePresence>
            {bootDone && (
              <motion.form
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                onSubmit={handleSubmit}
                className="space-y-4"
              >
                {/* Username */}
                <div>
                  <label className="block text-text-muted text-xs font-mono tracking-widest mb-2">
                    USER_ID:
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neon-dim font-mono text-sm">▸</span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="input-cyber w-full pl-8 pr-4 py-3 text-sm rounded-sm"
                      placeholder="enter_username"
                      autoComplete="username"
                      autoFocus
                      disabled={isLogging}
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-text-muted text-xs font-mono tracking-widest mb-2">
                    ACCESS_KEY:
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neon-dim font-mono text-sm">▸</span>
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input-cyber w-full pl-8 pr-12 py-3 text-sm rounded-sm"
                      placeholder="••••••••••••"
                      autoComplete="current-password"
                      disabled={isLogging}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-xs font-mono hover:text-neon-green transition-colors"
                    >
                      {showPass ? 'HIDE' : 'SHOW'}
                    </button>
                  </div>
                </div>

                {/* Error */}
                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 p-3 rounded-sm text-xs font-mono"
                      style={{
                        background: 'rgba(255,34,68,0.1)',
                        border: '1px solid rgba(255,34,68,0.4)',
                        color: '#ff2244',
                        boxShadow: '0 0 10px rgba(255,34,68,0.2)',
                      }}
                    >
                      <span>⛔</span>
                      {error}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Submit */}
                <motion.button
                  type="submit"
                  disabled={isLogging || !username || !password}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                  className="w-full py-4 font-mono font-bold text-sm tracking-widest rounded-sm relative overflow-hidden transition-all"
                  style={{
                    background: isLogging ? 'rgba(0,255,102,0.15)' : 'rgba(0,255,102,0.08)',
                    border: '1px solid #00ff66',
                    color: '#00ff66',
                    boxShadow: '0 0 15px rgba(0,255,102,0.3)',
                    cursor: isLogging ? 'wait' : (!username || !password) ? 'not-allowed' : 'pointer',
                    opacity: (!username || !password) ? 0.6 : 1,
                  }}
                >
                  {isLogging ? (
                    <span className="flex items-center justify-center gap-2">
                      <motion.span
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="inline-block"
                      >
                        ◎
                      </motion.span>
                      AUTHENTICATING...
                    </span>
                  ) : (
                    '▶ INITIATE ACCESS'
                  )}
                </motion.button>

                {/* Footer */}
                <div className="text-center pt-2">
                  <div className="text-text-muted text-xs font-mono opacity-50" style={{ fontSize: '0.6rem' }}>
                    HACKER509 v1.0.0 | UNAUTHORIZED ACCESS IS PROHIBITED
                  </div>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  )
}
