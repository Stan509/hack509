import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'

const STATUS_COLORS = {
  answered:     { label: 'ANSWERED',   color: '#00ff66' },
  busy:         { label: 'BUSY',       color: '#ff9900' },
  voicemail:    { label: 'VOICEMAIL',  color: '#a855f7' },
  no_answer:    { label: 'NO ANSWER',  color: '#6b7280' },
  wrong_number: { label: 'WRONG #',   color: '#ff9900' },
  do_not_call:  { label: 'DNC',        color: '#ff2244' },
  callback:     { label: 'CALLBACK',   color: '#00d4ff' },
}

function CallRow({ call, onSelect }) {
  const statusCfg = STATUS_COLORS[call.status] || { label: call.status?.toUpperCase() || 'UNKNOWN', color: '#3d5a3d' }
  const duration = call.duration ? `${Math.floor(call.duration / 60)}m ${call.duration % 60}s` : '--'

  return (
    <motion.tr
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="group cursor-pointer"
      onClick={() => onSelect(call)}
    >
      <td className="group-hover:text-neon-green transition-colors">
        {call.contact_name || `${call.first_name || ''} ${call.last_name || ''}`.trim() || 'Unknown'}
      </td>
      <td className="text-neon-dim">{call.phone || '--'}</td>
      <td>
        <span
          className="badge-cyber rounded-sm"
          style={{ color: statusCfg.color, background: `${statusCfg.color}18`, border: `1px solid ${statusCfg.color}44` }}
        >
          {statusCfg.label}
        </span>
      </td>
      <td className="text-text-muted">{duration}</td>
      <td className="text-text-muted">{call.operator || '--'}</td>
      <td className="text-text-muted" style={{ fontSize: '0.65rem' }}>
        {call.created_at ? new Date(call.created_at).toLocaleString() : '--'}
      </td>
      <td>
        {call.notes && (
          <span className="text-text-muted text-xs font-mono truncate max-w-24 block" title={call.notes}>
            {call.notes.slice(0, 30)}{call.notes.length > 30 ? '...' : ''}
          </span>
        )}
      </td>
    </motion.tr>
  )
}

export default function CallHistory() {
  const { api } = useAuth()
  const [calls, setCalls] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selectedCall, setSelectedCall] = useState(null)
  const PAGE_SIZE = 25

  const loadCalls = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page,
        page_size: PAGE_SIZE,
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
        ...(dateFrom && { date_from: dateFrom }),
        ...(dateTo && { date_to: dateTo }),
      })
      const res = await api.get(`/api/calls/?${params}`)
      const data = res.data
      setCalls(data.results || data || [])
      setTotal(data.count || data.length || 0)
    } catch {
      setCalls([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadCalls() }, [page, search, statusFilter, dateFrom, dateTo])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  const stats = {
    total: calls.length,
    answered: calls.filter((c) => c.status === 'answered').length,
    rate: calls.length ? ((calls.filter((c) => c.status === 'answered').length / calls.length) * 100).toFixed(1) : '0',
    avgDuration: calls.length
      ? Math.round(calls.filter((c) => c.duration).reduce((a, c) => a + c.duration, 0) / (calls.filter((c) => c.duration).length || 1))
      : 0,
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <div className="terminal-header mb-1">Analytics</div>
          <h1 className="text-xl font-mono font-bold" style={{ color: '#00ff66', textShadow: '0 0 10px #00ff66' }}>
            CALL HISTORY
            <span className="ml-3 text-sm font-normal text-text-muted">[{total.toLocaleString()} RECORDS]</span>
          </h1>
        </motion.div>
        <button onClick={loadCalls} className="btn-cyber px-4 py-2 text-xs rounded-sm">↻ REFRESH</button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'THIS PAGE', value: calls.length, color: '#00ff66' },
          { label: 'ANSWERED', value: stats.answered, color: '#00ff66' },
          { label: 'CONNECT RATE', value: `${stats.rate}%`, color: '#ff9900' },
          { label: 'AVG DURATION', value: stats.avgDuration ? `${stats.avgDuration}s` : '--', color: '#a855f7' },
        ].map((s, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="card-cyber rounded p-4"
          >
            <div className="terminal-header mb-1">{s.label}</div>
            <div className="text-xl font-mono font-bold" style={{ color: s.color, textShadow: `0 0 8px ${s.color}` }}>
              {s.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">⌕</span>
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="input-cyber w-full pl-8 pr-4 py-2 text-xs rounded-sm"
            placeholder="SEARCH BY NAME OR PHONE..."
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
          className="input-cyber px-3 py-2 text-xs rounded-sm"
          style={{ background: '#080808' }}
        >
          <option value="">ALL STATUS</option>
          {Object.entries(STATUS_COLORS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
          className="input-cyber px-3 py-2 text-xs rounded-sm"
          style={{ background: '#080808', colorScheme: 'dark' }}
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
          className="input-cyber px-3 py-2 text-xs rounded-sm"
          style={{ background: '#080808', colorScheme: 'dark' }}
        />
      </div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card-cyber rounded overflow-hidden"
      >
        <div className="overflow-x-auto">
          <table className="table-cyber">
            <thead>
              <tr>
                <th>CONTACT</th>
                <th>PHONE</th>
                <th>STATUS</th>
                <th>DURATION</th>
                <th>OPERATOR</th>
                <th>TIMESTAMP</th>
                <th>NOTES</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-12">
                    <motion.div
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ duration: 1, repeat: Infinity }}
                      className="text-neon-green font-mono text-sm"
                    >
                      ◎ LOADING RECORDS...
                    </motion.div>
                  </td>
                </tr>
              ) : calls.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-text-muted text-xs font-mono">
                    NO CALL RECORDS FOUND
                  </td>
                </tr>
              ) : (
                calls.map((call, i) => (
                  <CallRow key={call.id || i} call={call} onSelect={setSelectedCall} />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neon-green border-opacity-10">
            <div className="text-text-muted text-xs font-mono">
              PAGE {page} / {totalPages} — {total} TOTAL
            </div>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                className="btn-cyber px-3 py-1 text-xs rounded-sm" style={{ opacity: page === 1 ? 0.4 : 1 }}>
                ← PREV
              </button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="btn-cyber px-3 py-1 text-xs rounded-sm" style={{ opacity: page === totalPages ? 0.4 : 1 }}>
                NEXT →
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Call Detail Modal */}
      {selectedCall && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.8)' }}
          onClick={(e) => e.target === e.currentTarget && setSelectedCall(null)}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="card-cyber rounded p-6 w-full max-w-md mx-4"
            style={{ border: '1px solid rgba(0,255,102,0.3)', boxShadow: '0 0 40px rgba(0,255,102,0.1)' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-neon-green font-mono font-bold">CALL RECORD</h3>
              <button onClick={() => setSelectedCall(null)} className="text-text-muted hover:text-neon-danger font-mono">✕</button>
            </div>
            <div className="space-y-3">
              {[
                { label: 'CONTACT', value: selectedCall.contact_name || `${selectedCall.first_name || ''} ${selectedCall.last_name || ''}`.trim() },
                { label: 'PHONE', value: selectedCall.phone },
                { label: 'STATUS', value: selectedCall.status?.replace('_', ' ').toUpperCase() },
                { label: 'DURATION', value: selectedCall.duration ? `${selectedCall.duration}s` : '--' },
                { label: 'OPERATOR', value: selectedCall.operator || '--' },
                { label: 'TIMESTAMP', value: selectedCall.created_at ? new Date(selectedCall.created_at).toLocaleString() : '--' },
              ].map((field) => (
                <div key={field.label} className="flex items-start gap-3">
                  <span className="terminal-header w-24 flex-shrink-0 mt-0.5">{field.label}:</span>
                  <span className="text-text-terminal text-xs font-mono">{field.value || '--'}</span>
                </div>
              ))}
              {selectedCall.notes && (
                <div>
                  <div className="terminal-header mb-1">NOTES:</div>
                  <div className="text-text-terminal text-xs font-mono p-2 rounded-sm"
                    style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(0,255,102,0.1)' }}>
                    {selectedCall.notes}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}
