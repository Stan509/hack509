use crate::models::{ContactInfo, QueueState};
use tokio::sync::RwLock;

/// Thread-safe dialer queue.
/// Wrap in `Arc` for sharing across Actix workers.
pub struct DialerQueue {
    state: RwLock<QueueState>,
}

impl DialerQueue {
    pub fn new() -> Self {
        Self {
            state: RwLock::new(QueueState::new()),
        }
    }

    // -----------------------------------------------------------------------
    // Mutation helpers
    // -----------------------------------------------------------------------

    /// Push a single contact to the back of the queue.
    #[allow(dead_code)]
    pub async fn push_contact(&self, contact: ContactInfo) {
        let mut s = self.state.write().await;
        log::debug!(
            "Queue: push {} {} (id={})",
            contact.first_name,
            contact.last_name,
            contact.id
        );
        s.contacts.push_back(contact);
    }

    /// Bulk-add a list of contacts.
    pub async fn push_bulk(&self, contacts: Vec<ContactInfo>) {
        let mut s = self.state.write().await;
        log::info!("Queue: bulk-add {} contacts", contacts.len());
        for c in contacts {
            s.contacts.push_back(c);
        }
    }

    /// Pop the front contact and mark it as the active call.
    /// Returns `None` if the queue is empty or paused.
    pub async fn pop_contact(&self) -> Option<ContactInfo> {
        let mut s = self.state.write().await;
        if s.paused {
            log::warn!("Queue: pop attempted while paused");
            return None;
        }
        let contact = s.contacts.pop_front()?;
        log::info!(
            "Queue: dialling {} {} (id={})",
            contact.first_name,
            contact.last_name,
            contact.id
        );
        s.active_call = Some(contact.clone());
        Some(contact)
    }

    /// Finish the active call (clears active_call).
    pub async fn end_call(&self) -> Option<ContactInfo> {
        let mut s = self.state.write().await;
        let ended = s.active_call.take();
        if let Some(ref c) = ended {
            log::info!("Queue: call ended for contact id={}", c.id);
        }
        ended
    }

    /// Pause the queue (no new calls will be started).
    pub async fn pause(&self) {
        let mut s = self.state.write().await;
        s.paused = true;
        log::info!("Queue: paused");
    }

    /// Resume the queue.
    pub async fn resume(&self) {
        let mut s = self.state.write().await;
        s.paused = false;
        log::info!("Queue: resumed");
    }

    /// Empty the queue (does NOT affect an active call).
    pub async fn clear(&self) {
        let mut s = self.state.write().await;
        let n = s.contacts.len();
        s.contacts.clear();
        log::info!("Queue: cleared {n} contacts");
    }

    // -----------------------------------------------------------------------
    // Read helpers
    // -----------------------------------------------------------------------

    /// Return the current queue length and a peek at the next contact.
    pub async fn get_state(&self) -> (usize, Option<ContactInfo>, bool, Option<ContactInfo>) {
        let s = self.state.read().await;
        let count = s.contacts.len();
        let next = s.contacts.front().cloned();
        let paused = s.paused;
        let active = s.active_call.clone();
        (count, next, paused, active)
    }

    /// Snapshot the entire queue state for REST responses.
    #[allow(dead_code)]
    pub async fn snapshot(&self) -> QueueState {
        let s = self.state.read().await;
        s.clone()
    }
}

impl Default for DialerQueue {
    fn default() -> Self {
        Self::new()
    }
}
