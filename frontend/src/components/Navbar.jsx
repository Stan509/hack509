import { NavLink, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDialer } from '../contexts/DialerContext.jsx'

const navItems = [
  { path: '/', label: 'TABLEAU', shortLabel: 'ACCUEIL', icon: '⬡' },
  { path: '/dialer', label: 'DIALER', shortLabel: 'DIALER', icon: '☎' },
  { path: '/contacts', label: 'CONTACTS', shortLabel: 'CONTACTS', icon: '◈' },
  { path: '/history', label: 'HISTORIQUE', shortLabel: 'HISTORIQUE', icon: '◷' },
]

const adminItems = [
  { path: '/settings', label: 'CONFIG', shortLabel: 'CONFIG', icon: '⚙' },
  { path: '/users', label: 'USERS', shortLabel: 'USERS', icon: '◉' },
]

export default function Navbar() {
  const { user, logout, isAdmin } = useAuth()
  const { wsStatus, callStatus, callTimer, formatTimer } = useDialer()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isCallActive = callStatus === 'active' || callStatus === 'holding' || callStatus === 'dialing' || callStatus === 'ringing'
  const wsColor = wsStatus === 'connected' ? 'text-neon-green' : wsStatus === 'connecting' ? 'text-neon-warn' : 'text-neon-danger'
  const wsGlow = wsStatus === 'connected' ? '#00ff66' : wsStatus === 'connecting' ? '#ff9900' : '#ff2244'

  const allItems = isAdmin() ? [...navItems, ...adminItems] : navItems

  return (
    <>
      {/* ========================================================================= */}
      {/* TOP HEADER (Desktop & Mobile)                                             */}
      {/* ========================================================================= */}
      <header
        className="bg-bg-card/95 border-b border-neon-green/20 sticky top-0 z-40 backdrop-blur-md"
        style={{ boxShadow: '0 2px 20px rgba(0,255,102,0.06)' }}
      >
        <div className="h-[2px] bg-gradient-to-r from-transparent via-neon-green to-transparent opacity-60" />

        <div className="flex items-center justify-between px-3 md:px-6 py-2.5">
          {/* Logo */}
          <NavLink to="/" className="flex items-center gap-2 group shrink-0">
            <div
              className="text-neon-green font-mono font-bold text-lg md:text-xl tracking-widest flex items-center gap-1.5"
              style={{ textShadow: '0 0 12px #00ff66' }}
            >
              <span className="text-sm md:text-base">⚡</span>
              <span>H509</span>
            </div>
            <div className="hidden sm:block border-l border-neon-green/20 pl-2">
              <div className="text-text-muted text-[0.65rem] font-mono tracking-wider">HACKER509</div>
              <div className="text-text-muted text-[0.55rem] font-mono opacity-50">LH5 LELEY 509</div>
            </div>
          </NavLink>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            {allItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono tracking-wider transition-all duration-150 rounded ${
                    isActive
                      ? 'text-neon-green bg-neon-green/10 border-b-2 border-neon-green font-bold shadow-[0_0_10px_rgba(0,255,102,0.2)]'
                      : 'text-text-muted hover:text-neon-green hover:bg-neon-green/5'
                  }`
                }
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Top Right Status & User */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Live Call Banner Indicator */}
            {isCallActive && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[0.65rem] md:text-xs font-mono font-bold cursor-pointer"
                onClick={() => navigate('/dialer')}
                style={{
                  background: callStatus === 'active' ? 'rgba(0,255,102,0.15)' : 'rgba(255,153,0,0.15)',
                  border: `1px solid ${callStatus === 'active' ? '#00ff66' : '#ff9900'}`,
                  color: callStatus === 'active' ? '#00ff66' : '#ff9900',
                  boxShadow: callStatus === 'active' ? '0 0 10px rgba(0,255,102,0.3)' : '0 0 10px rgba(255,153,0,0.3)',
                }}
                title="Cliquer pour revenir à l'appel en cours"
              >
                <span className="w-2 h-2 rounded-full bg-current animate-ping" />
                <span className="truncate max-w-[120px] md:max-w-none">
                  {callStatus === 'active' ? `APPEL (${formatTimer(callTimer)})` : callStatus.toUpperCase()}
                </span>
              </motion.div>
            )}

            {/* WebSocket connection dot */}
            <div className="flex items-center gap-1.5 text-[0.65rem] font-mono px-2 py-1 rounded bg-black/40 border border-white/5">
              <span
                className="w-2 h-2 rounded-full inline-block"
                style={{
                  background: wsGlow,
                  boxShadow: `0 0 6px ${wsGlow}`,
                  animation: wsStatus === 'connected' ? 'pulse 2s infinite' : 'none',
                }}
              />
              <span className={`hidden sm:inline ${wsColor}`}>
                {wsStatus.toUpperCase()}
              </span>
            </div>

            {/* User chip & Logout */}
            {user && (
              <div className="flex items-center gap-1.5">
                <div className="hidden lg:block text-right">
                  <div className="text-text-terminal text-xs font-mono font-bold">{user.username}</div>
                  <div
                    className={`text-[0.6rem] font-mono ${user.role === 'admin' ? 'text-neon-warn' : 'text-neon-dim'}`}
                  >
                    {user.role?.toUpperCase()}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="btn-cyber btn-danger px-2.5 py-1 text-[0.7rem] rounded font-bold"
                  title="Déconnexion"
                >
                  SORTIE
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ========================================================================= */}
      {/* MOBILE BOTTOM NAVIGATION BAR (Visible strictly on mobile < md)           */}
      {/* ========================================================================= */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-xl border-t border-neon-green/30"
        style={{
          boxShadow: '0 -4px 25px rgba(0, 255, 102, 0.12)',
        }}
      >
        <div
          className={`grid ${allItems.length === 6 ? 'grid-cols-6' : 'grid-cols-4 sm:grid-cols-5'} items-center h-[58px] px-1`}
        >
          {allItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center h-full py-1 px-0.5 transition-all duration-150 select-none ${
                  isActive
                    ? 'text-neon-green font-bold bg-neon-green/10'
                    : 'text-text-muted hover:text-white hover:bg-white/5'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Glowing active indicator line at the top */}
                  {isActive && (
                    <motion.div
                      layoutId="activeBottomTab"
                      className="absolute top-0 left-1 right-1 h-[2.5px] bg-neon-green"
                      style={{
                        boxShadow: '0 0 10px #00ff66, 0 0 20px #00ff66',
                      }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}

                  {/* Icon with call badge if dialer has active call */}
                  <div className="relative text-base leading-none mb-1">
                    <span>{item.icon}</span>
                    {item.path === '/dialer' && isCallActive && (
                      <span className="absolute -top-1 -right-2 w-2.5 h-2.5 rounded-full bg-neon-green animate-ping shadow-[0_0_8px_#00ff66]" />
                    )}
                  </div>

                  {/* Short Label */}
                  <span
                    className="text-[0.58rem] font-mono tracking-tighter truncate max-w-full"
                    style={isActive ? { textShadow: '0 0 8px rgba(0,255,102,0.6)' } : {}}
                  >
                    {item.shortLabel}
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* iOS Home Indicator Safe Area spacer */}
        <div className="h-[env(safe-area-inset-bottom,0px)] bg-black" />
      </nav>
    </>
  )
}
