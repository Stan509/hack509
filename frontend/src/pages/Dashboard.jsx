import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'
import { useDialer } from '../contexts/DialerContext.jsx'

function StatCard({ label, value, icon, color = '#00ff66', loading }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-cyber rounded p-5 relative overflow-hidden"
    >
      {/* Glow corner */}
      <div className="absolute top-0 right-0 w-16 h-16 opacity-5"
        style={{ background: `radial-gradient(circle at top right, ${color}, transparent)` }} />

      <div className="flex items-start justify-between">
        <div>
          <div className="terminal-header mb-2">{label}</div>
          <div className="text-3xl font-mono font-bold" style={{ color, textShadow: `0 0 15px ${color}` }}>
            {loading ? (
              <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                ----
              </motion.span>
            ) : value}
          </div>
        </div>
        <div className="text-2xl opacity-30" style={{ color }}>{icon}</div>
      </div>
    </motion.div>
  )
}

function SystemStatusRow({ name, status, detail }) {
  const colors = { online: '#00ff66', warning: '#ff9900', offline: '#ff2244', checking: '#3d5a3d' }
  const col = colors[status] || colors.checking
  return (
    <div className="flex items-center justify-between py-2 border-b border-neon-green border-opacity-5">
      <span className="text-text-terminal text-xs font-mono">{name}</span>
      <div className="flex items-center gap-2">
        {detail && <span className="text-text-muted text-xs font-mono" style={{ fontSize: '0.65rem' }}>{detail}</span>}
        <span
          className="status-dot"
          style={{ background: col, boxShadow: `0 0 6px ${col}`, animation: status === 'online' ? 'pulse-dot 1.5s infinite' : 'none' }}
        />
        <span className="text-xs font-mono" style={{ color: col, fontSize: '0.65rem' }}>{status.toUpperCase()}</span>
      </div>
    </div>
  )
}

function RecentCallRow({ call }) {
  const STATUS_COLORS = {
    answered: '#00ff66', busy: '#ff9900', voicemail: '#a855f7',
    no_answer: '#6b7280', wrong_number: '#ff9900', do_not_call: '#ff2244',
  }
  const col = STATUS_COLORS[call.status] || '#3d5a3d'
  return (
    <tr className="group">
      <td className="px-3 py-2 text-text-terminal text-xs font-mono group-hover:text-neon-green transition-colors">
        {call.contact_name || call.phone}
      </td>
      <td className="px-3 py-2 text-text-muted text-xs font-mono">{call.phone}</td>
      <td className="px-3 py-2">
        <span className="badge-cyber rounded-sm" style={{ color: col, background: `${col}18`, border: `1px solid ${col}44` }}>
          {call.status?.replace('_', ' ').toUpperCase()}
        </span>
      </td>
      <td className="px-3 py-2 text-text-muted text-xs font-mono">{call.duration ? `${call.duration}s` : '--'}</td>
      <td className="px-3 py-2 text-text-muted text-xs font-mono" style={{ fontSize: '0.65rem' }}>
        {call.created_at ? new Date(call.created_at).toLocaleTimeString() : '--'}
      </td>
    </tr>
  )
}

export default function Dashboard() {
  const { api, user } = useAuth()
  const { wsStatus, queue, callStatus } = useDialer()
  const navigate = useNavigate()

  const [stats, setStats] = useState(null)
  const [recentCalls, setRecentCalls] = useState([])
  const [sysStatus, setSysStatus] = useState({ django: 'checking', twilio: 'checking', rust: 'checking' })
  const [clock, setClock] = useState(new Date())
  const [loading, setLoading] = useState(true)

  // Live clock
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // Load data
  useEffect(() => {
    const load = async () => {
      try {
        const [statsRes, callsRes] = await Promise.allSettled([
          api.get('/api/calls/stats/'),
          api.get('/api/calls/?page_size=10'),
        ])
        if (statsRes.status === 'fulfilled') setStats(statsRes.value.data)
        if (callsRes.status === 'fulfilled') setRecentCalls(callsRes.value.data?.results || callsRes.value.data || [])

        // Check Django status
        setSysStatus((prev) => ({ ...prev, django: 'online' }))
      } catch {
        setSysStatus((prev) => ({ ...prev, django: 'offline' }))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // WS status reflects Rust server
  useEffect(() => {
    setSysStatus((prev) => ({
      ...prev,
      rust: wsStatus === 'connected' ? 'online' : wsStatus === 'connecting' ? 'checking' : 'offline',
    }))
  }, [wsStatus])

  // Check Twilio
  useEffect(() => {
    api.get('/api/twilio/config/').then((res) => {
      setSysStatus((prev) => ({ ...prev, twilio: res.data?.is_configured ? 'online' : 'warning' }))
    }).catch(() => {
      setSysStatus((prev) => ({ ...prev, twilio: 'warning' }))
    })
  }, [])

  const timeStr = clock.toLocaleTimeString('en-US', { hour12: false })
  const dateStr = clock.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="terminal-header mb-1">HACKER509 // MAIN TERMINAL</div>
          <h1 className="text-2xl font-mono font-bold" style={{ color: '#00ff66', textShadow: '0 0 15px #00ff66' }}>
            DASHBOARD
          </h1>
          <div className="text-text-muted text-xs font-mono mt-1">
            Welcome, <span className="text-neon-green">{user?.username}</span> —{' '}
            <span className="text-neon-warn">{user?.role?.toUpperCase()}</span>
          </div>
        </motion.div>

        {/* Live Clock */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-right card-cyber rounded p-3"
        >
          <div
            className="text-2xl font-mono font-bold"
            style={{ color: '#00ff66', textShadow: '0 0 10px #00ff66', fontVariantNumeric: 'tabular-nums' }}
          >
            {timeStr}
          </div>
          <div className="text-text-muted text-xs font-mono mt-1">{dateStr}</div>
        </motion.div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="TOTAL CONTACTS" value={stats?.total_contacts?.toLocaleString() ?? '0'} icon="◈" loading={loading} />
        <StatCard label="CALLS TODAY" value={stats?.calls_today?.toLocaleString() ?? '0'} icon="☎" color="#00d4ff" loading={loading} />
        <StatCard
          label="CONNECTION RATE"
          value={stats?.connection_rate != null ? `${stats.connection_rate.toFixed(1)}%` : '0%'}
          icon="◎"
          color="#ff9900"
          loading={loading}
        />
        <StatCard label="ACTIVE OPERATORS" value={stats?.active_operators ?? '0'} icon="◉" color="#a855f7" loading={loading} />
      </div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="flex flex-wrap gap-3"
      >
        <button
          onClick={() => navigate('/dialer')}
          className="btn-cyber px-6 py-3 text-sm rounded font-bold"
          style={{ boxShadow: '0 0 15px rgba(0,255,102,0.3)' }}
        >
          ⚡ LAUNCH DIALER
        </button>
        <button
          onClick={() => navigate('/contacts')}
          className="btn-cyber px-6 py-3 text-sm rounded font-bold"
          style={{ borderColor: '#00d4ff', color: '#00d4ff' }}
        >
          ⬆ IMPORT LEADS
        </button>
        <button
          onClick={() => navigate('/history')}
          className="btn-cyber px-6 py-3 text-sm rounded"
          style={{ borderColor: '#a855f7', color: '#a855f7' }}
        >
          ◷ CALL HISTORY
        </button>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Calls Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="lg:col-span-2 card-cyber rounded overflow-hidden"
        >
          <div className="p-4 border-b border-neon-green border-opacity-10">
            <div className="terminal-header mb-1">Recent Activity</div>
            <h2 className="text-text-terminal text-sm font-mono font-bold">CALL LOG</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table-cyber">
              <thead>
                <tr>
                  <th>CONTACT</th>
                  <th>PHONE</th>
                  <th>STATUS</th>
                  <th>DURATION</th>
                  <th>TIME</th>
                </tr>
              </thead>
              <tbody>
                {recentCalls.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-text-muted text-xs font-mono">
                      NO RECENT CALLS — SYSTEM IDLE
                    </td>
                  </tr>
                ) : (
                  recentCalls.map((call, i) => <RecentCallRow key={call.id || i} call={call} />)
                )}
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* System Status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card-cyber rounded overflow-hidden"
        >
          <div className="p-4 border-b border-neon-green border-opacity-10">
            <div className="terminal-header mb-1">Infrastructure</div>
            <h2 className="text-text-terminal text-sm font-mono font-bold">SYSTEM STATUS</h2>
          </div>
          <div className="p-4 space-y-1">
            <SystemStatusRow name="Django API" status={sysStatus.django} detail=":8000" />
            <SystemStatusRow name="Rust WS Server" status={sysStatus.rust} detail=":8001" />
            <SystemStatusRow name="Twilio Gateway" status={sysStatus.twilio} />
            <SystemStatusRow
              name="Dialer Engine"
              status={callStatus !== 'idle' ? 'online' : wsStatus === 'connected' ? 'online' : 'offline'}
              detail={callStatus !== 'idle' ? callStatus.toUpperCase() : undefined}
            />
          </div>

          {/* Queue status */}
          <div className="mx-4 mb-4 p-3 rounded-sm" style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,102,0.1)' }}>
            <div className="terminal-header mb-2">Queue Status</div>
            <div className="flex items-center justify-between">
              <span className="text-text-muted text-xs font-mono">Contacts queued</span>
              <span className="text-neon-green font-mono font-bold text-sm">{queue.length}</span>
            </div>
          </div>

          {/* HACKER509 branding */}
          <div className="px-4 pb-4 text-center">
            <div className="separator-neon" />
            <div className="text-neon-green font-mono font-bold text-sm" style={{ textShadow: '0 0 10px #00ff66' }}>
              HACKER509
            </div>
            <div className="text-text-muted font-mono" style={{ fontSize: '0.6rem' }}>
              by LH5 Leley Hacker 509
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
