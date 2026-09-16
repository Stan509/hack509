import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../contexts/AuthContext.jsx'

function ConfigField({ label, value, onChange, type = 'text', placeholder = '', masked = false, hint = '', required = false }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block terminal-header mb-1 flex items-center justify-between">
        <span>{label}</span>
        {required && <span className="text-neon-green text-[0.65rem] font-mono">[REQUIS]</span>}
      </label>
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
            {show ? 'MASQUER' : 'AFFICHER'}
          </button>
        )}
      </div>
      {hint && <div className="text-text-muted text-xs font-mono mt-1" style={{ fontSize: '0.65rem' }}>{hint}</div>}
    </div>
  )
}

function BrowserProxySection({ api }) {
  const [proxyCfg, setProxyCfg] = useState({
    enabled: false,
    provider: 'Decodo',
    protocol: 'http',
    host: 'gate.decodo.com',
    port: 7000,
    username: '',
    password: '',
    country: 'US',
    session_type: 'sticky',
    session_duration: 30,
    has_password: false,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveErr, setSaveErr] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    api.get('/api/browser/proxy/')
      .then((res) => {
        if (res.data) {
          setProxyCfg((prev) => ({
            ...prev,
            ...res.data,
            password: '',
          }))
        }
      })
      .catch((err) => console.warn('Load proxy config error:', err))
      .finally(() => setLoading(false))
  }, [api])

  const handleSaveProxy = async (e) => {
    if (e) e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    setSaveErr('')
    try {
      const payload = { ...proxyCfg }
      if (!payload.password) delete payload.password
      const res = await api.post('/api/browser/proxy/', payload)
      setSaveMsg(res.data?.message || 'Configuration proxy enregistrée avec succès.')
      setProxyCfg((p) => ({ ...p, has_password: Boolean(res.data?.has_password || p.has_password), password: '' }))
      setTimeout(() => setSaveMsg(''), 5000)
    } catch (err) {
      setSaveErr(err.response?.data?.message || 'Erreur lors de la sauvegarde du proxy.')
    } finally {
      setSaving(false)
    }
  }

  const handleDisableProxy = async () => {
    setProxyCfg((prev) => ({ ...prev, enabled: false }))
    try {
      await api.post('/api/browser/proxy/', { ...proxyCfg, enabled: false, password: '' })
      setSaveMsg('Proxy désactivé. Le navigateur utilise désormais l’adresse IP directe du serveur.')
      setTimeout(() => setSaveMsg(''), 5000)
    } catch (err) {
      setSaveErr('Erreur lors de la désactivation.')
    }
  }

  const handleClearProxy = async () => {
    if (!window.confirm('Voulez-vous effacer définitivement les identifiants et l’hôte proxy ?')) return
    try {
      await api.delete('/api/browser/proxy/')
      setProxyCfg({
        enabled: false,
        provider: 'Decodo',
        protocol: 'http',
        host: '',
        port: 7000,
        username: '',
        password: '',
        country: 'US',
        session_type: 'sticky',
        session_duration: 30,
        has_password: false,
      })
      setSaveMsg('Configuration proxy effacée.')
      setTimeout(() => setSaveMsg(''), 4000)
    } catch (err) {
      setSaveErr('Erreur lors de la réinitialisation du proxy.')
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const payload = { ...proxyCfg }
      const res = await api.post('/api/browser/proxy/test/', payload)
      setTestResult(res.data)
    } catch (err) {
      setTestResult({
        success: false,
        error: err.response?.data?.error || err.message || 'Échec du test de connexion réseau.',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-cyber rounded p-6"
      style={{
        border: '1px solid rgba(0, 212, 255, 0.4)',
        boxShadow: '0 0 30px rgba(0, 212, 255, 0.08)',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-px h-8 bg-neon-cyan" style={{ boxShadow: '0 0 6px #00d4ff' }} />
          <div>
            <div className="terminal-header mb-0.5">Réseau & Empreinte IP</div>
            <h2 className="text-neon-cyan font-mono font-bold">PROXY DU NAVIGATEUR (DECODO / CONNEXION DIRECTE)</h2>
          </div>
        </div>

        {/* Toggle Switch */}
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={proxyCfg.enabled}
            onChange={(e) => setProxyCfg((p) => ({ ...p, enabled: e.target.checked }))}
            className="sr-only"
          />
          <div
            className={`w-11 h-6 rounded-full transition-colors flex items-center p-1 ${
              proxyCfg.enabled ? 'bg-neon-cyan' : 'bg-white/10'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-black transition-transform ${
                proxyCfg.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </div>
          <span className="font-mono text-xs font-bold text-white">
            {proxyCfg.enabled ? 'PROXY ACTIVÉ' : 'CONNEXION DIRECTE (IP SERVEUR)'}
          </span>
        </label>
      </div>

      <div className="text-text-muted text-xs font-mono mb-5">
        Le navigateur Chromium distant utilise par défaut l’adresse IP naturelle de votre serveur. Si votre serveur n'est pas situé aux États-Unis ou subit des limitations, activez le proxy résidentiel Decodo ou votre fournisseur HTTP/SOCKS5.
      </div>

      <form onSubmit={handleSaveProxy} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ConfigField
            label="FOURNISSEUR"
            value={proxyCfg.provider}
            onChange={(v) => setProxyCfg((p) => ({ ...p, provider: v }))}
            placeholder="Decodo"
            hint="Nom du fournisseur (ex: Decodo)"
          />
          <div>
            <label className="block terminal-header mb-1">PROTOCOLE</label>
            <select
              value={proxyCfg.protocol}
              onChange={(e) => setProxyCfg((p) => ({ ...p, protocol: e.target.value }))}
              className="input-cyber w-full px-3 py-2.5 text-sm rounded-sm bg-black"
            >
              <option value="http">HTTP (Recommandé Decodo)</option>
              <option value="socks5">SOCKS5</option>
            </select>
            <div className="text-text-muted text-xs font-mono mt-1" style={{ fontSize: '0.65rem' }}>
              Protocole de connexion proxy
            </div>
          </div>
          <ConfigField
            label="PAYS DE SORTIE"
            value={proxyCfg.country}
            onChange={(v) => setProxyCfg((p) => ({ ...p, country: v }))}
            placeholder="US"
            hint="Code ISO du pays (ex: US pour États-Unis)"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <ConfigField
              label="HÔTE DU PROXY"
              value={proxyCfg.host}
              onChange={(v) => setProxyCfg((p) => ({ ...p, host: v }))}
              placeholder="gate.decodo.com"
              hint="Exemple Decodo: gate.decodo.com"
            />
          </div>
          <ConfigField
            label="PORT DU PROXY"
            value={proxyCfg.port}
            onChange={(v) => setProxyCfg((p) => ({ ...p, port: v }))}
            placeholder="7000"
            hint="Port du proxy (ex: 7000)"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConfigField
            label="NOM D'UTILISATEUR (AUTHENTIFICATION)"
            value={proxyCfg.username}
            onChange={(v) => setProxyCfg((p) => ({ ...p, username: v }))}
            placeholder="user-IDENTIFIANT-country-us"
            hint="Format Decodo suggéré : user-IDENTIFIANT-country-us"
          />
          <ConfigField
            label={proxyCfg.has_password ? 'MOT DE PASSE PROXY [DÉJÀ CONFIGURÉ]' : 'MOT DE PASSE PROXY'}
            value={proxyCfg.password}
            onChange={(v) => setProxyCfg((p) => ({ ...p, password: v }))}
            placeholder={proxyCfg.has_password ? '••••••••••••' : 'Saisir le mot de passe proxy'}
            masked
            hint="Stocké de manière sécurisée côté serveur. Jamais affiché en clair."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block terminal-header mb-1">TYPE DE SESSION</label>
            <select
              value={proxyCfg.session_type}
              onChange={(e) => setProxyCfg((p) => ({ ...p, session_type: e.target.value }))}
              className="input-cyber w-full px-3 py-2.5 text-sm rounded-sm bg-black"
            >
              <option value="sticky">Session Persistante (Sticky IP)</option>
              <option value="rotating">Session Rotative (Changement d'IP automatique)</option>
            </select>
          </div>
          <ConfigField
            label="DURÉE DE SESSION (MINUTES)"
            type="number"
            value={proxyCfg.session_duration}
            onChange={(v) => setProxyCfg((p) => ({ ...p, session_duration: v }))}
            placeholder="30"
            hint="Durée de conservation de la même IP résidentielle"
          />
        </div>

        {/* Feedback messages */}
        <AnimatePresence>
          {saveMsg && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-neon-cyan text-xs font-mono p-3 rounded-sm bg-neon-cyan/10 border border-neon-cyan/30"
            >
              ✓ {saveMsg}
            </motion.div>
          )}
          {saveErr && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-neon-danger text-xs font-mono p-3 rounded-sm bg-neon-danger/10 border border-neon-danger/30"
            >
              ⛔ {saveErr}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Test Result Display */}
        <AnimatePresence>
          {testResult && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-4 rounded-sm text-xs font-mono space-y-2"
              style={{
                background: testResult.success ? 'rgba(0, 255, 102, 0.08)' : 'rgba(255, 34, 68, 0.08)',
                border: `1px solid ${testResult.success ? 'rgba(0, 255, 102, 0.3)' : 'rgba(255, 34, 68, 0.3)'}`,
              }}
            >
              <div className="font-bold flex items-center justify-between">
                <span style={{ color: testResult.success ? '#00ff66' : '#ff2244' }}>
                  {testResult.success ? '✓ TEST DE CONNEXION RÉUSSI' : '⛔ ÉCHEC DE LA CONNEXION'}
                </span>
                <span className="text-text-muted">
                  MODE : {testResult.mode === 'proxy' ? 'PROXY ACTIF' : 'IP NATURELLE SERVEUR'}
                </span>
              </div>

              {testResult.success ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1 text-white">
                  <div>
                    <span className="text-text-muted">ADRESSE IP : </span>
                    <strong className="text-neon-green">{testResult.ip}</strong>
                  </div>
                  <div>
                    <span className="text-text-muted">PAYS DÉTECTÉ : </span>
                    <strong className="text-white">{testResult.country}</strong> {testResult.city && `(${testResult.city})`}
                  </div>
                  <div>
                    <span className="text-text-muted">CONFORMITÉ US : </span>
                    {testResult.is_us ? (
                      <span className="text-neon-green font-bold">[LOCALISATION : ÉTATS-UNIS ✓]</span>
                    ) : (
                      <span className="text-neon-warn font-bold">[NON-US — REQUIS POUR TPS/FPS ⚠️]</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-neon-danger pt-1">
                  <strong>DIAGNOSTIC : </strong> {testResult.error}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Buttons */}
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="btn-cyber flex-1 py-3 text-sm font-bold rounded-sm border-neon-cyan text-neon-cyan hover:bg-neon-cyan/10 cursor-pointer"
          >
            {saving ? '⟳ ENREGISTREMENT...' : '▶ ENREGISTRER LA CONFIGURATION PROXY'}
          </button>
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="btn-cyber px-5 py-3 text-sm font-bold rounded-sm cursor-pointer"
            style={{ borderColor: '#00ff66', color: '#00ff66' }}
            title="Tester l'adresse IP de sortie et la localisation géographique"
          >
            {testing ? '⟳ TEST EN COURS...' : '⚡ TESTER LA CONNEXION (IP / PAYS)'}
          </button>
          {proxyCfg.enabled && (
            <button
              type="button"
              onClick={handleDisableProxy}
              className="btn-cyber px-4 py-3 text-xs font-mono rounded-sm cursor-pointer"
              style={{ borderColor: '#ff9900', color: '#ff9900' }}
            >
              DÉSACTIVER PROXY
            </button>
          )}
          <button
            type="button"
            onClick={handleClearProxy}
            className="btn-cyber btn-danger px-4 py-3 text-xs font-mono rounded-sm cursor-pointer"
            title="Effacer l'hôte et les identifiants"
          >
            EFFACER
          </button>
        </div>
      </form>
    </motion.div>
  )
}

export default function Settings() {
  const { api } = useAuth()

  const [providerType, setProviderType] = useState('twilio') // 'twilio' | 'asterisk'
  const [config, setConfig] = useState({
    provider_type: 'twilio',
    account_sid: '',
    auth_token: '',
    phone_number: '',
    caller_id_name: '',
    twiml_app_sid: '',
    api_key_sid: '',
    api_key_secret: '',
    sip_ws_url: '',
    sip_username: '',
    sip_password: '',
    sip_domain: '',
    sip_outbound_proxy: '',
  })
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [saveError, setSaveError] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [configStatus, setConfigStatus] = useState(null)
  const [hasAuthToken, setHasAuthToken] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showDanger, setShowDanger] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    api.get('/api/twilio/config/')
      .then((res) => {
        const d = res.data
        setProviderType(d.provider_type || 'twilio')
        setConfig({
          provider_type: d.provider_type || 'twilio',
          account_sid: d.account_sid || '',
          auth_token: '',
          phone_number: d.phone_number || '',
          caller_id_name: d.caller_id_name || '',
          twiml_app_sid: d.twiml_app_sid || '',
          api_key_sid: d.api_key_sid || '',
          api_key_secret: '',
          sip_ws_url: d.sip_ws_url || '',
          sip_username: d.sip_username || '',
          sip_password: '',
          sip_domain: d.sip_domain || '',
          sip_outbound_proxy: d.sip_outbound_proxy || '',
        })
        setConfigStatus(d.is_configured ? 'configured' : 'not_configured')
        setHasAuthToken(Boolean(d.has_auth_token))
      })
      .catch(() => {
        setConfigStatus('not_configured')
        setLoadError('Impossible de charger la configuration actuelle.')
      })
  }, [])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveMsg('')
    setSaveError('')
    try {
      const payload = { ...config, provider_type: providerType }
      if (!payload.auth_token) delete payload.auth_token
      if (!payload.api_key_secret) delete payload.api_key_secret
      if (!payload.sip_password) delete payload.sip_password

      const res = await api.post('/api/twilio/config/', payload)
      const d = res.data
      setConfig((prev) => ({
        ...prev,
        ...d,
        auth_token: '',
        api_key_secret: '',
        sip_password: '',
      }))
      setHasAuthToken(Boolean(d.has_auth_token))
      setSaveMsg(`CONFIGURATION ${providerType.toUpperCase()} SAUVEGARDÉE AVEC SUCCÈS !`)
      setConfigStatus('configured')
      setTimeout(() => setSaveMsg(''), 5000)
    } catch (err) {
      setSaveError(err.response?.data?.detail || err.response?.data?.message || 'Erreur lors de la sauvegarde de la configuration')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.get('/api/twilio/test/')
      setTestResult({ success: true, message: res.data?.message || 'Connexion réussie !' })
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.message || err.response?.data?.detail || 'Échec de connexion' })
    } finally {
      setTesting(false)
    }
  }

  const handleReset = async () => {
    if (!window.confirm('CONFIRMER : Supprimer toute la configuration téléphonique ?')) return
    setResetting(true)
    try {
      await api.delete('/api/twilio/config/')
      setConfig({
        provider_type: 'twilio',
        account_sid: '',
        auth_token: '',
        phone_number: '',
        caller_id_name: '',
        twiml_app_sid: '',
        api_key_sid: '',
        api_key_secret: '',
        sip_ws_url: '',
        sip_username: '',
        sip_password: '',
        sip_domain: '',
        sip_outbound_proxy: '',
      })
      setConfigStatus('not_configured')
      setHasAuthToken(false)
      setShowDanger(false)
    } catch (err) {
      setSaveError(err.response?.data?.detail || 'Échec de la réinitialisation')
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
          CONFIGURATION TÉLÉPHONIQUE MULTI-FOURNISSEURS
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
            STATUT MOTEUR ({providerType.toUpperCase()}) : {configStatus === 'configured' ? 'OPÉRATIONNEL (EN LIGNE)' : 'NON CONFIGURÉ'}
          </div>
          <div className="text-text-muted text-xs font-mono" style={{ fontSize: '0.65rem' }}>
            {configStatus === 'configured' ? 'Système prêt à passer et recevoir des appels vocaux.' : 'Choisissez votre fournisseur ci-dessous et saisissez vos accès.'}
          </div>
        </div>
      </motion.div>

      {/* Provider Selector Tabs */}
      <div className="flex gap-2 bg-black/60 p-1.5 rounded card-cyber border border-white/10">
        <button
          type="button"
          onClick={() => {
            setProviderType('twilio')
            setConfig((p) => ({ ...p, provider_type: 'twilio' }))
          }}
          className={`flex-1 py-3 text-xs font-mono font-bold rounded-sm transition-all flex items-center justify-center gap-2 ${
            providerType === 'twilio'
              ? 'bg-neon-green/20 text-neon-green border border-neon-green/50 shadow-[0_0_12px_rgba(0,255,102,0.2)]'
              : 'text-text-muted hover:text-white'
          }`}
        >
          <span>📞 TWILIO NATIVE VOICE SDK</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setProviderType('asterisk')
            setConfig((p) => ({ ...p, provider_type: 'asterisk' }))
          }}
          className={`flex-1 py-3 text-xs font-mono font-bold rounded-sm transition-all flex items-center justify-center gap-2 ${
            providerType === 'asterisk'
              ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50 shadow-[0_0_12px_rgba(0,212,255,0.2)]'
              : 'text-text-muted hover:text-white'
          }`}
        >
          <span>🖥️ ASTERISK / VOIPGATE / SIPPORTAL</span>
        </button>
      </div>

      {/* Twilio Config Form */}
      {providerType === 'twilio' && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-cyber rounded p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-px h-8 bg-neon-green" style={{ boxShadow: '0 0 6px #00ff66' }} />
            <div>
              <div className="terminal-header mb-0.5">Moteur Téléphonique</div>
              <h2 className="text-text-terminal font-mono font-bold">CONFIGURATION TWILIO VOICE</h2>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <ConfigField
              label="1. ACCOUNT SID (Commence par AC...)"
              required
              value={config.account_sid}
              onChange={(v) => {
                const val = v.trim()
                if (val.startsWith('SK')) {
                  setConfig((p) => ({ ...p, api_key_sid: val }))
                } else if (val.startsWith('AP')) {
                  setConfig((p) => ({ ...p, twiml_app_sid: val }))
                } else {
                  setConfig((p) => ({ ...p, account_sid: v }))
                }
              }}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              hint="Situé sur la page d'accueil principale de votre Console Twilio (Doit commencer par AC)"
            />
            <ConfigField
              label={hasAuthToken ? "2. AUTH TOKEN (🔒 Sauvegardé & Encrypté)" : "2. AUTH TOKEN (Clé secrète à 32 caractères)"}
              required
              value={config.auth_token}
              onChange={(v) => setConfig((p) => ({ ...p, auth_token: v }))}
              placeholder={hasAuthToken ? "✓ Token sauvegardé — Laissez vide pour le conserver" : "Collez votre Auth Token Twilio ici"}
              masked
              hint={hasAuthToken ? "✓ Votre Auth Token est sécurisé en base de données. Laissez ce champ vide sauf modification." : "Situé juste sous l'Account SID sur la Console Twilio (32 caractères hexadécimaux)"}
            />
            <ConfigField
              label="3. NUMÉRO DE TÉLÉPHONE TWILIO"
              required
              value={config.phone_number}
              onChange={(v) => setConfig((p) => ({ ...p, phone_number: v }))}
              placeholder="+19286688247"
              hint="Votre numéro d'appel sortant acheté sur Twilio au format international e.g. +19286688247"
            />

            {/* Advanced / Auto-generated Accordion */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs font-mono text-text-muted hover:text-neon-green flex items-center gap-2 py-1 transition-colors"
              >
                <span>{showAdvanced ? '▲ MASQUER' : '▼ AFFICHER'} PARAMÈTRES AVANCÉS (GÉNÉRÉS AUTOMATIQUEMENT)</span>
                {config.api_key_sid && <span className="text-neon-green text-[0.6rem]">[SK CONFIGURÉ]</span>}
              </button>

              <AnimatePresence>
                {showAdvanced && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 p-4 rounded bg-black/40 border border-white/10 space-y-4"
                  >
                    <ConfigField
                      label="TWIML APP SID (AP...)"
                      value={config.twiml_app_sid}
                      onChange={(v) => setConfig((p) => ({ ...p, twiml_app_sid: v }))}
                      placeholder="Auto-généré : APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                    <ConfigField
                      label="API KEY SID (SK...)"
                      value={config.api_key_sid}
                      onChange={(v) => setConfig((p) => ({ ...p, api_key_sid: v }))}
                      placeholder="Auto-généré : SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    />
                    <ConfigField
                      label="API KEY SECRET"
                      value={config.api_key_secret}
                      onChange={(v) => setConfig((p) => ({ ...p, api_key_secret: v }))}
                      placeholder="Auto-généré lors de la création de la clé"
                      masked
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

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
                {saving ? '⟳ SAUVEGARDE ET GÉNÉRATION AUTOMATIQUE...' : '▶ ENREGISTRER CONFIGURATION TWILIO'}
              </button>
              <button
                type="button"
                onClick={handleTest}
                disabled={testing || configStatus !== 'configured'}
                className="btn-cyber px-6 py-3 text-sm rounded-sm"
                style={{ borderColor: '#00d4ff', color: '#00d4ff', opacity: configStatus !== 'configured' ? 0.4 : 1 }}
              >
                {testing ? '⟳' : '⚡ TESTER CONNEXION'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Asterisk / SIP Config Form */}
      {providerType === 'asterisk' && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="card-cyber rounded p-6 border border-neon-cyan/40"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-px h-8 bg-neon-cyan" style={{ boxShadow: '0 0 6px #00d4ff' }} />
            <div>
              <div className="terminal-header mb-0.5">Moteur Téléphonique SIP / WebRTC</div>
              <h2 className="text-neon-cyan font-mono font-bold">CONFIGURATION ASTERISK, VOIPGATE & SIPPORTAL</h2>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-5">
            <ConfigField
              label="1. WEBSOCKET URL (wss://...)"
              required
              value={config.sip_ws_url}
              onChange={(v) => setConfig((p) => ({ ...p, sip_ws_url: v }))}
              placeholder="wss://pbx.votre-domaine.com/sip-ws"
              hint="URL WebSocket du PBX Asterisk. Ne mettez pas ici le domaine du trunk Twilio : le trunk se configure côté PBX."
            />
            <ConfigField
              label="2. NOM D'UTILISATEUR / EXTENSION SIP"
              required
              value={config.sip_username}
              onChange={(v) => setConfig((p) => ({ ...p, sip_username: v }))}
              placeholder="1001 ou agent1"
              hint="Extension WebRTC d’agent créée dans Asterisk, par exemple 1001. Ce n’est pas le nom de votre trunk Twilio."
            />
            <ConfigField
              label="3. MOT DE PASSE SIP / SECRET"
              required
              value={config.sip_password}
              onChange={(v) => setConfig((p) => ({ ...p, sip_password: v }))}
              placeholder="Mot de passe secret SIP"
              masked
              hint="Mot de passe d'authentification SIP défini sur Asterisk ou votre provider"
            />
            <ConfigField
              label="4. DOMAINE SIP / REALM"
              value={config.sip_domain}
              onChange={(v) => setConfig((p) => ({ ...p, sip_domain: v }))}
              placeholder="pbx.votre-domaine.com"
              hint="Domaine/realm du PBX Asterisk, identique au domaine dans l’URL WebSocket."
            />
            <ConfigField
              label="5. NUMÉRO D'APPEL SORTANT (CALLER ID)"
              value={config.phone_number}
              onChange={(v) => setConfig((p) => ({ ...p, phone_number: v }))}
              placeholder="+19286688247"
              hint="Numéro d'affichage de l'appelant au format international e.g. +19286688247"
            />

            {/* Feedback */}
            <AnimatePresence>
              {saveMsg && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-neon-cyan text-xs font-mono p-3 rounded-sm bg-neon-cyan/10 border border-neon-cyan/30">
                  ✓ {saveMsg}
                </motion.div>
              )}
              {saveError && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="text-neon-danger text-xs font-mono p-3 rounded-sm bg-neon-danger/10 border border-neon-danger/30">
                  ⛔ {saveError}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="btn-cyber flex-1 py-3 text-sm font-bold rounded-sm border-neon-cyan text-neon-cyan hover:bg-neon-cyan/10"
              >
                {saving ? '⟳ SAUVEGARDE EN COURS...' : '▶ ENREGISTRER CONFIGURATION ASTERISK / SIP'}
              </button>
              <button
                type="button"
                onClick={handleTest}
                disabled={testing}
                className="btn-cyber px-6 py-3 text-sm rounded-sm"
                style={{ borderColor: '#00d4ff', color: '#00d4ff' }}
              >
                {testing ? '⟳' : '⚡ TESTER SIP'}
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Test result */}
      <AnimatePresence>
        {testResult && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-3 rounded-sm text-xs font-mono"
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

      {/* Browser Proxy Settings (Decodo / Natural Server IP) */}
      <BrowserProxySection api={api} />

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
            <div className="terminal-header mb-0.5" style={{ color: '#ff224488' }}>Actions Irréversibles</div>
            <h2 className="text-neon-danger font-mono font-bold">ZONE DE DANGER</h2>
          </div>
        </div>

        <button
          onClick={() => setShowDanger(!showDanger)}
          className="btn-cyber btn-danger px-4 py-2 text-xs rounded-sm"
        >
          {showDanger ? '▲ MASQUER' : '▼ AFFICHER LA ZONE DE DANGER'}
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
              <div className="text-text-terminal font-mono text-sm font-bold mb-2">Réinitialiser la configuration Téléphonique</div>
              <div className="text-text-muted text-xs font-mono mb-4">
                Ceci supprimera définitivement tous les identifiants téléphoniques stockés (Twilio et Asterisk).
              </div>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="btn-cyber btn-danger px-6 py-2 text-xs rounded-sm font-bold"
              >
                {resetting ? '⟳ RÉINITIALISATION...' : '⛔ RÉINITIALISER'}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
