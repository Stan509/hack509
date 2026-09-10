use std::collections::HashMap;
use tokio::sync::RwLock;
use uuid::Uuid;

/// Per-operator audio configuration.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct AudioConfig {
    pub noise_gate: bool,
    pub echo_cancel: bool,
    pub gain: f32,
}

impl Default for AudioConfig {
    fn default() -> Self {
        Self {
            noise_gate: true,
            echo_cancel: true,
            gain: 1.0,
        }
    }
}

/// Registry that maps a session ID → AudioConfig.
/// Wrapped externally in Arc so it can be shared across Actix workers.
pub struct AudioManager {
    configs: RwLock<HashMap<Uuid, AudioConfig>>,
}

impl AudioManager {
    pub fn new() -> Self {
        Self {
            configs: RwLock::new(HashMap::new()),
        }
    }

    /// Insert a default config for a newly connected session.
    pub async fn register_session(&self, session_id: Uuid) {
        let mut map = self.configs.write().await;
        map.entry(session_id).or_insert_with(AudioConfig::default);
        log::debug!("AudioManager: registered session {session_id}");
    }

    /// Remove a session's config on disconnect.
    pub async fn unregister_session(&self, session_id: Uuid) {
        let mut map = self.configs.write().await;
        map.remove(&session_id);
        log::debug!("AudioManager: unregistered session {session_id}");
    }

    /// Apply new audio settings for a session.
    pub async fn set_config(
        &self,
        session_id: Uuid,
        noise_gate: bool,
        echo_cancel: bool,
    ) -> AudioConfig {
        let mut map = self.configs.write().await;
        let cfg = map.entry(session_id).or_insert_with(AudioConfig::default);
        cfg.noise_gate = noise_gate;
        cfg.echo_cancel = echo_cancel;
        log::info!(
            "AudioManager: session {session_id} → noise_gate={noise_gate} echo_cancel={echo_cancel}"
        );
        cfg.clone()
    }

    /// Read a session's current config.
    #[allow(dead_code)]
    pub async fn get_config(&self, session_id: Uuid) -> Option<AudioConfig> {
        let map = self.configs.read().await;
        map.get(&session_id).cloned()
    }

    /// Update the gain for a session.
    #[allow(dead_code)]
    pub async fn set_gain(&self, session_id: Uuid, gain: f32) {
        let mut map = self.configs.write().await;
        let cfg = map.entry(session_id).or_insert_with(AudioConfig::default);
        cfg.gain = gain.clamp(0.0, 4.0);
        log::debug!("AudioManager: session {session_id} gain → {}", cfg.gain);
    }
}

impl Default for AudioManager {
    fn default() -> Self {
        Self::new()
    }
}
