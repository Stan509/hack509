import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'

function UserRow({ user, onDelete, currentUser }) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const isSelf = user.username === currentUser?.username

  const handleDelete = async () => {
    if (!confirming) { setConfirming(true); return }
    setDeleting(true)
    await onDelete(user.id)
    setDeleting(false)
    setConfirming(false)
  }

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      layout
      className="group"
    >
      <td className="group-hover:text-neon-green transition-colors">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-sm flex items-center justify-center text-xs font-mono font-bold"
            style={{ background: 'rgba(0,255,102,0.1)', color: '#00ff66', border: '1px solid rgba(0,255,102,0.2)' }}>
            {user.username[0].toUpperCase()}
          </div>
          {user.username}
          {isSelf && <span className="text-neon-dim text-xs font-mono ml-1">(YOU)</span>}
        </div>
      </td>
      <td>
        <span
          className="badge-cyber rounded-sm"
          style={{
            color: user.role === 'admin' ? '#ff9900' : '#00ff66',
            background: user.role === 'admin' ? 'rgba(255,153,0,0.1)' : 'rgba(0,255,102,0.1)',
            border: `1px solid ${user.role === 'admin' ? 'rgba(255,153,0,0.3)' : 'rgba(0,255,102,0.3)'}`,
          }}
        >
          {user.role?.toUpperCase() || 'OPERATOR'}
        </span>
      </td>
      <td className="text-text-muted" style={{ fontSize: '0.7rem' }}>
        {user.date_joined ? new Date(user.date_joined).toLocaleDateString() : '--'}
      </td>
      <td className="text-text-muted">
        <span
          className="status-dot mr-2"
          style={{ background: user.is_active ? '#00ff66' : '#ff2244', boxShadow: `0 0 4px ${user.is_active ? '#00ff66' : '#ff2244'}` }}
        />
        {user.is_active ? 'ACTIVE' : 'DISABLED'}
      </td>
      <td>
        {!isSelf && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="btn-cyber btn-danger px-3 py-1 text-xs rounded-sm"
          >
            {deleting ? '⟳' : confirming ? '⚠ CONFIRM?' : '✕ DELETE'}
          </button>
        )}
      </td>
    </motion.tr>
  )
}

export default function UserManagement() {
  const { api, user: currentUser } = useAuth()

  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [form, setForm] = useState({ username: '', password: '', role: 'operator' })
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')
  const [createError, setCreateError] = useState('')

  const loadUsers = async () => {
    setLoading(true)
    try {
      const res = await api.get('/api/users/')
      setUsers(res.data.results || res.data || [])
    } catch {
      setLoadError('Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadUsers() }, [])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!form.username.trim() || !form.password) { setCreateError('Username and password are required'); return }
    setCreating(true)
    setCreateError('')
    setCreateMsg('')
    try {
      await api.post('/api/users/', {
        username: form.username.trim(),
        password: form.password,
        role: form.role,
        is_staff: form.role === 'admin',
      })
      setCreateMsg(`OPERATOR "${form.username}" CREATED SUCCESSFULLY`)
      setForm({ username: '', password: '', role: 'operator' })
      await loadUsers()
      setTimeout(() => setCreateMsg(''), 4000)
    } catch (err) {
      setCreateError(err.response?.data?.username?.[0] || err.response?.data?.detail || 'Failed to create user')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (userId) => {
    try {
      await api.delete(`/api/users/${userId}/`)
      setUsers((prev) => prev.filter((u) => u.id !== userId))
    } catch (err) {
      alert(err.response?.data?.detail || 'Delete failed')
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <div className="terminal-header mb-1">Admin // Personnel</div>
        <h1 className="text-xl font-mono font-bold" style={{ color: '#00ff66', textShadow: '0 0 10px #00ff66' }}>
          USER MANAGEMENT
          <span className="ml-3 text-sm font-normal text-text-muted">[{users.length} OPERATORS]</span>
        </h1>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create Operator Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-cyber rounded p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-px h-8 bg-neon-green" style={{ boxShadow: '0 0 6px #00ff66' }} />
            <div>
              <div className="terminal-header mb-0.5">Personnel</div>
              <h2 className="text-text-terminal font-mono font-bold">CREATE OPERATOR</h2>
            </div>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block terminal-header mb-1">USERNAME:</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
                className="input-cyber w-full px-3 py-2 text-sm rounded-sm"
                placeholder="new_operator"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block terminal-header mb-1">PASSWORD:</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                className="input-cyber w-full px-3 py-2 text-sm rounded-sm"
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label className="block terminal-header mb-1">ROLE:</label>
              <select
                value={form.role}
                onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
                className="input-cyber w-full px-3 py-2 text-sm rounded-sm"
                style={{ background: '#080808' }}
              >
                <option value="operator">OPERATOR</option>
                <option value="admin">ADMIN</option>
              </select>
            </div>

            <AnimatePresence>
              {createMsg && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-neon-green text-xs font-mono p-2 rounded-sm"
                  style={{ background: 'rgba(0,255,102,0.1)', border: '1px solid rgba(0,255,102,0.3)' }}>
                  ✓ {createMsg}
                </motion.div>
              )}
              {createError && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-neon-danger text-xs font-mono p-2 rounded-sm"
                  style={{ background: 'rgba(255,34,68,0.1)', border: '1px solid rgba(255,34,68,0.3)' }}>
                  ⛔ {createError}
                </motion.div>
              )}
            </AnimatePresence>

            <button
              type="submit"
              disabled={creating}
              className="btn-cyber w-full py-3 text-sm font-bold rounded-sm"
            >
              {creating ? '⟳ CREATING...' : '+ CREATE OPERATOR'}
            </button>
          </form>
        </motion.div>

        {/* Users Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2 card-cyber rounded overflow-hidden"
        >
          <div className="p-4 border-b border-neon-green border-opacity-10 flex items-center justify-between">
            <div>
              <div className="terminal-header mb-0.5">Personnel Database</div>
              <h2 className="text-text-terminal font-mono font-bold text-sm">ACTIVE ACCOUNTS</h2>
            </div>
            <button onClick={loadUsers} className="btn-cyber px-3 py-1 text-xs rounded-sm">↻</button>
          </div>

          {loadError && (
            <div className="p-4 text-neon-danger text-xs font-mono">{loadError}</div>
          )}

          <div className="overflow-x-auto">
            <table className="table-cyber">
              <thead>
                <tr>
                  <th>USERNAME</th>
                  <th>ROLE</th>
                  <th>CREATED</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10">
                      <motion.div
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ duration: 1, repeat: Infinity }}
                        className="text-neon-green font-mono text-sm"
                      >
                        ◎ LOADING USERS...
                      </motion.div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-text-muted text-xs font-mono">
                      NO USERS FOUND
                    </td>
                  </tr>
                ) : (
                  <AnimatePresence>
                    {users.map((u) => (
                      <UserRow key={u.id} user={u} onDelete={handleDelete} currentUser={currentUser} />
                    ))}
                  </AnimatePresence>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
