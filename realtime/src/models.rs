use serde::{Deserialize, Serialize};
use std::collections::VecDeque;

// ---------------------------------------------------------------------------
// Incoming messages (client → server)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ClientMessage {
    DialNext,
    PauseQueue,
    ResumeQueue,
    HangUp,
    SetAudioConfig {
        noise_gate: bool,
        echo_cancel: bool,
    },
    Authenticate {
        token: String,
    },
    AddToQueue {
        contacts: Vec<ContactInfo>,
    },
}

// ---------------------------------------------------------------------------
// Outgoing messages (server → client)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ServerMessage {
    QueueUpdate {
        count: usize,
        next: Option<ContactInfo>,
    },
    CallStarted {
        contact_id: i64,
        contact_name: String,
        phone: String,
    },
    CallEnded {
        contact_id: i64,
        duration: u64,
    },
    QueuePaused,
    QueueResumed,
    Error {
        message: String,
    },
    Authenticated {
        username: String,
    },
    AudioConfigSet {
        noise_gate: bool,
        echo_cancel: bool,
    },
}

// ---------------------------------------------------------------------------
// Contact / Queue state
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContactInfo {
    pub id: i64,
    pub first_name: String,
    pub last_name: String,
    pub phone: String,
    pub address: String,
}

impl ContactInfo {
    /// Returns "First Last"
    pub fn full_name(&self) -> String {
        format!("{} {}", self.first_name, self.last_name)
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct QueueState {
    pub contacts: VecDeque<ContactInfo>,
    pub paused: bool,
    pub active_call: Option<ContactInfo>,
}

impl QueueState {
    pub fn new() -> Self {
        Self {
            contacts: VecDeque::new(),
            paused: false,
            active_call: None,
        }
    }
}

impl Default for QueueState {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// REST API types
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
pub struct AddContactsRequest {
    pub contacts: Vec<ContactInfo>,
}

#[derive(Debug, Serialize)]
pub struct QueueStatusResponse {
    pub count: usize,
    pub paused: bool,
    pub active_call: Option<ContactInfo>,
    pub next: Option<ContactInfo>,
}
