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

export default function Settings() {
  const { api } = useAuth()

  const [config, setConfig] = useState({
    account_sid: '',
    auth_token: '',
    phone_number: '',
    caller_id_name: '',
    twiml_app_sid: '',
    api_key_sid: '',
    api_key_secret: '',
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
        setConfig({
          account_sid: d.account_sid || '',
          auth_token: '',
          phone_number: d.phone_number || '',
          caller_id_name: d.caller_id_name || '',
          twiml_app_sid: d.twiml_app_sid || '',
          api_key_sid: d.api_key_sid || '',
          api_key_secret: '',
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
      const payload = { ...config }
      if (!payload.auth_token) delete payload.auth_token
      if (!payload.api_key_secret) delete payload.api_key_secret

      const res = await api.post('/api/twilio/config/', payload)
      const d = res.data
      setConfig({
        account_sid: d.account_sid || '',
        auth_token: '',
        phone_number: d.phone_number || '',
        caller_id_name: d.caller_id_name || '',
        twiml_app_sid: d.twiml_app_sid || '',
        api_key_sid: d.api_key_sid || '',
        api_key_secret: '',
      })
      setHasAuthToken(Boolean(d.has_auth_token))
      setSaveMsg('CONFIGURATION ET CLÉS TWILIO SAUVEGARDÉES ET GÉNÉRÉES AUTOMATIQUEMENT !')
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
      setTestResult({ success: true, message: res.data?.message || 'Connexion à Twilio réussie !' })
    } catch (err) {
      setTestResult({ success: false, message: err.response?.data?.message || err.response?.data?.detail || 'Échec de connexion à Twilio' })
    } finally {
      setTesting(false)
    }
  }

  const handleReset = async () => {
    if (!window.confirm('CONFIRMER : Supprimer toute la configuration Twilio ?')) return
    setResetting(true)
    try {
      await api.delete('/api/twilio/config/')
      setConfig({ account_sid: '', auth_token: '', phone_number: '', caller_id_name: '', twiml_app_sid: '', api_key_sid: '', api_key_secret: '' })
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
          CONFIGURATION SIMPLIFIÉE TWILIO
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
            TWILIO : {configStatus === 'configured' ? 'OPÉRATIONNEL (EN LIGNE)' : 'NON CONFIGURÉ'}
          </div>
          <div className="text-text-muted text-xs font-mono" style={{ fontSize: '0.65rem' }}>
            {configStatus === 'configured' ? 'Remplissez uniquement les 3 champs ci-dessous. Les clés Web Voice SDK sont générées automatiquement !' : 'Entrez vos 3 identifiants Twilio de votre tableau de bord principal.'}
          </div>
        </div>
      </motion.div>

      {/* Auto-provision Banner */}
      <div className="p-4 rounded-sm font-mono text-xs border border-neon-green/30 bg-neon-green/5 text-neon-green flex items-start gap-3">
        <span className="text-base">⚡</span>
        <div>
          <div className="font-bold mb-1">AUTOMATISATION COMPLÈTE TWILIO VOICE SDK</div>
          <div className="text-text-muted" style={{ fontSize: '0.65rem' }}>
            Vous avez seulement besoin d'entrer vos <strong>3 identifiants de base</strong> présent sur votre écran d'accueil Twilio.
            Notre système crée et configure automatiquement les clés <strong>API Key (SK...)</strong> et <strong>Application TwiML (AP...)</strong> requises pour passer des appels depuis le navigateur !
          </div>
        </div>
      </div>

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
            <div className="terminal-header mb-0.5">Fournisseur Téléphonique</div>
            <h2 className="text-text-terminal font-mono font-bold">IDENTIFIANTS REQUIS (3 SEULS CHAMPS)</h2>
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
                  <div className="text-[0.7rem] font-mono text-neon-green mb-2">
                    ✓ Ces paramètres sont générés automatiquement par notre backend dès que vous enregistrez vos 3 identifiants ci-dessus ! Vous n'avez pas besoin d'y toucher.
                  </div>
                  <ConfigField
                    label="TWIML APP SID (AP...)"
                    value={config.twiml_app_sid}
                    onChange={(v) => setConfig((p) => ({ ...p, twiml_app_sid: v }))}
                    placeholder="Auto-généré : APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    hint="Application TwiML configurée pour router les appels vocaux du navigateur"
                  />
                  <ConfigField
                    label="API KEY SID (SK...)"
                    value={config.api_key_sid}
                    onChange={(v) => setConfig((p) => ({ ...p, api_key_sid: v }))}
                    placeholder="Auto-généré : SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    hint="Clé API pour la signature sécurisée des jetons Web Voice SDK"
                  />
                  <ConfigField
                    label="API KEY SECRET"
                    value={config.api_key_secret}
                    onChange={(v) => setConfig((p) => ({ ...p, api_key_secret: v }))}
                    placeholder="Auto-généré lors de la création de la clé"
                    masked
                    hint="Secret associé à la clé API Twilio"
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
              {saving ? '⟳ SAUVEGARDE ET GÉNÉRATION AUTOMATIQUE...' : '▶ ENREGISTRER (SAUVEGARDER & PROVISIONNER)'}
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
              <div className="text-text-terminal font-mono text-sm font-bold mb-2">Réinitialiser la configuration Twilio</div>
              <div className="text-text-muted text-xs font-mono mb-4">
                Ceci supprimera définitivement tous les identifiants Twilio stockés. Les appels seront désactivés immédiatement.
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
