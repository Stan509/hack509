import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'

function ConfigField({ label, value, onChange, type = 'text', placeholder = '', masked = false, hint = '' }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block terminal-header mb-1">{label}</label>
      <div className="relative">
        <input
          type={masked && !show ? 'password' : type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input-cyber w-full px-3 py-2.5 text-sm rounded-sm"
          placeholder={placeholder}
        />
        {masked && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted text-xs font-mono hover:text-neon-green transition-colors"
          >
            {show ? 'HIDE' : 'SHOW'}
          </button>
        )}
      </div>
      {hint && <div className="text-text-muted text-xs font-mono mt-1" style={{ fontSize: '0.6rem' }}>{hint}</div>}
    </div>
  )
}

export default function Settings() {
  const { api } = useAuth()

  const [config, setConfig] = useState({
    account_sid: '',
    auth_token: '',
    phone_number: '',
    caller_id_name: '',
    twiml_app_sid: '',
  })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveError, setSaveError] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [configStatus, setConfigStatus] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [showDanger, setShowDanger] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    api.get('/api/twilio/config/')
      .then((res) => {
        const d = res.data
        setConfig({
          account_sid: d.account_sid || '',
          auth_token: '',  // Never pre-fill token for security
          phone_number: d.phone_number || '',
          caller_id_name: d.caller_id_name || '',
          twiml_app_sid: d.twiml_app_sid || '',
        })
        setConfigStatus(d.is_configured ? 'configured' : 'not_configured')
      })
      .catch(() => {
        setConfigStatus('not_configured')
        setLoadError('Could not load existing config from server.')
      })
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    setSaveError('')
    try {
      // Only send auth_token if it was filled in
      const payload = { ...config }
      if (!payload.auth_token) delete payload.auth_token

      await api.post('/api/twilio/config/', payload)
      setSaveMsg('CONFIGURATION SAVED SUCCESSFULLY')
      setConfigStatus('configured')
      setTimeout(() => setSaveMsg(''), 4000)
    } catch (err) {
      setSaveError(err.response?.data?.detail || err.response?.data?.error || 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.get('/api/twilio/test/')
      setTestResult({ success: true, message: res.data?.message || 'Connection successful' })
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.detail || 'Connection failed' })
    } finally {
      setTesting(false)
    }
  }

  const handleReset = async () => {
    if (!window.confirm('CONFIRM: Delete all Twilio configuration? This cannot be undone.')) return
    setResetting(true)
    try {
      await api.delete('/api/twilio/config/')
      setConfig({ account_sid: '', auth_token: '', phone_number: '', caller_id_name: '', twiml_app_sid: '' })
      setConfigStatus('not_configured')
      setShowDanger(false)
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
        <div className="terminal-header mb-1">Admin // Infrastructure</div>
        <h1 className="text-xl font-mono font-bold" style={{ color: '#00ff66', textShadow: '0 0 10px #00ff66' }}>
          SYSTEM CONFIGURATION
        </h1>
      </motion.div>

      {loadError && (
        <div className="text-neon-warn text-xs font-mono p-3 rounded-sm"
          style={{ background: 'rgba(255,153,0,0.1)', border: '1px solid rgba(255,153,0,0.3)' }}>
          ⚠ {loadError}
        </div>
      )}

      {/* Config Status */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 p-4 rounded card-cyber"
      >
        <span
          className="status-dot"
          style={{
            background: configStatus === 'configured' ? '#00ff66' : '#ff2244',
            boxShadow: `0 0 8px ${configStatus === 'configured' ? '#00ff66' : '#ff2244'}`,
          }}
        />
        <div>
          <div className="text-sm font-mono font-bold"
            style={{ color: configStatus === 'configured' ? '#00ff66' : '#ff2244' }}>
            TWILIO: {configStatus === 'configured' ? 'CONFIGURED' : 'NOT CONFIGURED'}
          </div>
          <div className="text-text-muted text-xs font-mono" style={{ fontSize: '0.65rem' }}>
            {configStatus === 'configured' ? 'System is ready to make calls' : 'Enter credentials below to enable calling'}
          </div>
        </div>
      </motion.div>

      {/* Twilio Config Form */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card-cyber rounded p-6"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-px h-8 bg-neon-green" style={{ boxShadow: '0 0 6px #00ff66' }} />
          <div>
            <div className="terminal-header mb-0.5">Telephony Provider</div>
            <h2 className="text-text-terminal font-mono font-bold">TWILIO CONFIGURATION</h2>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <ConfigField
            label="ACCOUNT SID"
            value={config.account_sid}
            onChange={(v) => setConfig((p) => ({ ...p, account_sid: v }))}
            placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            hint="Found in Twilio Console Dashboard"
          />
          <ConfigField
            label="AUTH TOKEN"
            value={config.auth_token}
            onChange={(v) => setConfig((p) => ({ ...p, auth_token: v }))}
            placeholder="Leave blank to keep existing token"
            masked
            hint="Stored encrypted — leave blank to keep current value"
          />
          <ConfigField
            label="TWILIO PHONE NUMBER"
            value={config.phone_number}
            onChange={(v) => setConfig((p) => ({ ...p, phone_number: v }))}
            placeholder="+15550000000"
            hint="Your Twilio outbound number in E.164 format"
          />
          <ConfigField
            label="CALLER ID NAME (CNAM)"
            value={config.caller_id_name}
            onChange={(v) => setConfig((p) => ({ ...p, caller_id_name: v }))}
            placeholder="YOUR COMPANY"
            hint="Display name for outbound calls (max 15 chars)"
          />
          <ConfigField
            label="TWIML APP SID"
            value={config.twiml_app_sid}
            onChange={(v) => setConfig((p) => ({ ...p, twiml_app_sid: v }))}
            placeholder="APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            hint="Your TwiML Application SID for Voice SDK"
          />

          {/* Feedback */}
          <AnimatePresence>
            {saveMsg && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-neon-green text-xs font-mono p-3 rounded-sm"
                style={{ background: 'rgba(0,255,102,0.1)', border: '1px solid rgba(0,255,102,0.3)' }}>
                ✓ {saveMsg}
              </motion.div>
            )}
            {saveError && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="text-neon-danger text-xs font-mono p-3 rounded-sm"
                style={{ background: 'rgba(255,34,68,0.1)', border: '1px solid rgba(255,34,68,0.3)' }}>
                ⛔ {saveError}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="btn-cyber flex-1 py-3 text-sm font-bold rounded-sm"
            >
              {saving ? '⟳ SAVING...' : '▶ SAVE CONFIG'}
            </button>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing || configStatus !== 'configured'}
              className="btn-cyber px-6 py-3 text-sm rounded-sm"
              style={{ borderColor: '#00d4ff', color: '#00d4ff', opacity: configStatus !== 'configured' ? 0.4 : 1 }}
            >
              {testing ? '⟳' : '⚡ TEST'}
            </button>
          </div>
        </form>

        {/* Test result */}
        <AnimatePresence>
          {testResult && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-3 p-3 rounded-sm text-xs font-mono"
              style={{
                background: testResult.success ? 'rgba(0,255,102,0.08)' : 'rgba(255,34,68,0.08)',
                border: `1px solid ${testResult.success ? 'rgba(0,255,102,0.3)' : 'rgba(255,34,68,0.3)'}`,
                color: testResult.success ? '#00ff66' : '#ff2244',
              }}
            >
              {testResult.success ? '✓ ' : '⛔ '} {testResult.message}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Danger Zone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="card-cyber rounded p-6"
        style={{ borderColor: 'rgba(255,34,68,0.2)' }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-px h-8 bg-neon-danger" style={{ boxShadow: '0 0 6px #ff2244' }} />
          <div>
            <div className="terminal-header mb-0.5" style={{ color: '#ff224488' }}>Irreversible Actions</div>
            <h2 className="text-neon-danger font-mono font-bold">DANGER ZONE</h2>
          </div>
        </div>

        <button
          onClick={() => setShowDanger(!showDanger)}
          className="btn-cyber btn-danger px-4 py-2 text-xs rounded-sm"
        >
          {showDanger ? '▲ HIDE' : '▼ EXPAND DANGER ZONE'}
        </button>

        <AnimatePresence>
          {showDanger && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4 p-4 rounded-sm"
              style={{ background: 'rgba(255,34,68,0.05)', border: '1px solid rgba(255,34,68,0.2)' }}
            >
              <div className="text-text-terminal font-mono text-sm font-bold mb-2">Reset Twilio Configuration</div>
              <div className="text-text-muted text-xs font-mono mb-4">
                This will permanently delete all stored Twilio credentials. Calling will be disabled immediately.
              </div>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="btn-cyber btn-danger px-6 py-2 text-xs rounded-sm font-bold"
              >
                {resetting ? '⟳ RESETTING...' : '⛔ RESET CONFIG'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
