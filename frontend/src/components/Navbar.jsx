import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDialer } from '../contexts/DialerContext.jsx'

const navItems = [
  { path: '/', label: 'DASHBOARD', icon: '⬡' },
  { path: '/dialer', label: 'DIALER', icon: '☎' },
  { path: '/contacts', label: 'CONTACTS', icon: '◈' },
  { path: '/history', label: 'HISTORY', icon: '◷' },
]

const adminItems = [
  { path: '/settings', label: 'CONFIG', icon: '⚙' },
  { path: '/users', label: 'USERS', icon: '◉' },
]

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth()
  const { wsStatus, callStatus } = useDialer()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const wsColor = wsStatus === 'connected' ? 'text-neon-green' : wsStatus === 'connecting' ? 'text-neon-warn' : 'text-neon-danger'
  const wsGlow = wsStatus === 'connected' ? '#00ff66' : wsStatus === 'connecting' ? '#ff9900' : '#ff2244'

  const allItems = isAdmin() ? [...navItems, ...adminItems] : navItems

  return (
    <>
      <nav className="bg-bg-card border-b border-neon-green border-opacity-20 relative z-50"
        style={{ boxShadow: '0 2px 20px rgba(0,255,102,0.08)' }}>
        {/* Top accent line */}
        <div className="h-px bg-gradient-to-r from-transparent via-neon-green to-transparent opacity-50" />

        <div className="flex items-center justify-between px-4 py-3">
          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-3 group">
            <div className="text-neon-green font-mono font-bold text-xl tracking-widest"
              style={{ textShadow: '0 0 15px #00ff66, 0 0 30px rgba(0,255,102,0.4)' }}>
              H509
            </div>
            <div className="hidden sm:block">
              <div className="text-text-muted text-xs font-mono tracking-wider">HACKER509</div>
              <div className="text-text-muted text-xs font-mono opacity-50" style={{ fontSize: '0.6rem' }}>
                by LH5 Leley Hacker 509
              </div>
            </div>
          </NavLink>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {allItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-3 py-2 text-xs font-mono tracking-widest transition-all duration-200 rounded-sm ${
                    isActive
                      ? 'text-neon-green border-b-2 border-neon-green'
                      : 'text-text-muted hover:text-neon-green hover:bg-neon-green hover:bg-opacity-5'
                  }`
                }
                style={({ isActive }) => isActive ? { textShadow: '0 0 8px #00ff66' } : {}}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* WS Status */}
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
              <span
                className="status-dot"
                style={{ background: wsGlow, boxShadow: `0 0 6px ${wsGlow}`, animation: wsStatus === 'connected' ? 'pulse-dot 1.5s infinite' : 'none' }}
              />
              <span className={wsColor} style={{ fontSize: '0.6rem', letterSpacing: '0.1em' }}>
                {wsStatus.toUpperCase()}
              </span>
            </div>

            {/* Call status badge */}
            {callStatus !== 'idle' && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="hidden sm:flex items-center gap-1 px-2 py-1 rounded text-xs font-mono"
                style={{
                  background: callStatus === 'active' ? 'rgba(0,255,102,0.1)' : 'rgba(255,153,0,0.1)',
                  border: `1px solid ${callStatus === 'active' ? '#00ff66' : '#ff9900'}`,
                  color: callStatus === 'active' ? '#00ff66' : '#ff9900',
                  boxShadow: callStatus === 'active' ? '0 0 8px rgba(0,255,102,0.4)' : '0 0 8px rgba(255,153,0,0.4)',
                }}
              >
                <span style={{ animation: 'pulse-dot 1s infinite' }}>●</span>
                {callStatus.toUpperCase()}
              </motion.div>
            )}

            {/* User info */}
            {user && (
              <div className="flex items-center gap-2">
                <div className="hidden sm:block text-right">
                  <div className="text-text-terminal text-xs font-mono">{user.username}</div>
                  <div className={`text-xs font-mono tracking-wider ${user.role === 'admin' ? 'text-neon-warn' : 'text-neon-dim'}`}
                    style={{ fontSize: '0.6rem' }}>
                    {user.role?.toUpperCase()}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="btn-cyber btn-danger px-3 py-1 text-xs rounded-sm"
                >
                  LOGOUT
                </button>
              </div>
            )}

            {/* Mobile hamburger */}
            <button
              className="md:hidden text-neon-green p-1"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              <div className="w-5 h-px bg-neon-green mb-1" />
              <div className="w-5 h-px bg-neon-green mb-1" />
              <div className="w-5 h-px bg-neon-green" />
            </button>
          </div>
        </div>

        {/* Bottom accent line */}
        <div className="h-px bg-gradient-to-r from-transparent via-neon-green to-transparent opacity-20" />
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="md:hidden fixed top-[52px] left-0 right-0 z-40 bg-bg-card border-b border-neon-green border-opacity-30"
            style={{ boxShadow: '0 10px 40px rgba(0,255,102,0.1)' }}
          >
            {allItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                onClick={() => setMobileOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-6 py-3 text-sm font-mono border-b border-neon-green border-opacity-10 ${
                    isActive ? 'text-neon-green bg-neon-green bg-opacity-5' : 'text-text-muted'
                  }`
                }
              >
                <span>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
