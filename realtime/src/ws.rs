use crate::audio::AudioManager;
use crate::models::{ClientMessage, ServerMessage};
use crate::queue::DialerQueue;
use actix_web::web;
use actix_ws::{Message, Session};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use uuid::Uuid;

// ---------------------------------------------------------------------------
// Session registry shared across all handlers
// ---------------------------------------------------------------------------

pub type SessionRegistry = Arc<Mutex<Vec<(Uuid, Session)>>>;

/// Create a new empty registry.
pub fn new_registry() -> SessionRegistry {
    Arc::new(Mutex::new(Vec::new()))
}

// ---------------------------------------------------------------------------
// Heartbeat constants
// ---------------------------------------------------------------------------

const HEARTBEAT_INTERVAL: Duration = Duration::from_secs(15);
const CLIENT_TIMEOUT: Duration = Duration::from_secs(60);

// ---------------------------------------------------------------------------
// Broadcast helper – sends a ServerMessage to every registered session.
// Dead sessions are pruned from the registry on send failure.
// ---------------------------------------------------------------------------

pub async fn broadcast(registry: &SessionRegistry, msg: &ServerMessage) {
    let payload = match serde_json::to_string(msg) {
        Ok(s) => s,
        Err(e) => {
            log::error!("broadcast: serialisation error: {e}");
            return;
        }
    };

    let mut registry_guard = registry.lock().await;
    let mut alive: Vec<(Uuid, Session)> = Vec::with_capacity(registry_guard.len());

    for (id, mut session) in registry_guard.drain(..) {
        match session.text(payload.clone()).await {
            Ok(_) => alive.push((id, session)),
            Err(e) => log::warn!("broadcast: session {id} removed (send error: {e})"),
        }
    }

    *registry_guard = alive;
}

/// Send a ServerMessage to a single session (by cloning a serialised string).
async fn send_to(session: &mut Session, msg: &ServerMessage) -> bool {
    match serde_json::to_string(msg) {
        Ok(payload) => session.text(payload).await.is_ok(),
        Err(e) => {
            log::error!("send_to: serialisation error: {e}");
            false
        }
    }
}

// ---------------------------------------------------------------------------
// Main WebSocket handler
// ---------------------------------------------------------------------------

pub async fn ws_handler(
    mut session: Session,
    mut msg_stream: actix_ws::MessageStream,
    registry: web::Data<SessionRegistry>,
    queue: web::Data<Arc<DialerQueue>>,
    audio_mgr: web::Data<Arc<AudioManager>>,
) {
    let session_id = Uuid::new_v4();
    log::info!("WS: new session {session_id}");

    // Register this session in the audio manager.
    audio_mgr.register_session(session_id).await;

    // Send initial queue state.
    {
        let (count, next, _paused, _active) = queue.get_state().await;
        let init_msg = ServerMessage::QueueUpdate { count, next };
        let _ = send_to(&mut session, &init_msg).await;
    }

    // Add session to registry.
    {
        let mut reg = registry.lock().await;
        reg.push((session_id, session.clone()));
    }

    let mut last_heartbeat = Instant::now();

    // -----------------------------------------------------------------
    // Main receive loop
    // -----------------------------------------------------------------
    loop {
        // Check for timeout
        if last_heartbeat.elapsed() > CLIENT_TIMEOUT {
            log::warn!("WS: session {session_id} timed out — closing");
            let _ = session.close(None).await;
            break;
        }

        // Use a timeout so we can send periodic pings even when idle.
        let recv = tokio::time::timeout(HEARTBEAT_INTERVAL, msg_stream.recv()).await;

        match recv {
            // Timeout — send a ping to keep the connection alive.
            Err(_elapsed) => {
                if session.ping(b"ping").await.is_err() {
                    log::warn!("WS: session {session_id} ping failed — closing");
                    break;
                }
            }

            // Stream closed by client.
            Ok(None) => {
                log::info!("WS: session {session_id} stream closed");
                break;
            }

            Ok(Some(Ok(msg))) => {
                match msg {
                    Message::Text(text) => {
                        last_heartbeat = Instant::now();
                        handle_text_message(
                            session_id,
                            &mut session,
                            text.as_ref(),
                            &registry,
                            &queue,
                            &audio_mgr,
                        )
                        .await;
                    }

                    Message::Binary(_) => {
                        log::debug!("WS: session {session_id} binary message ignored");
                    }

                    Message::Ping(bytes) => {
                        last_heartbeat = Instant::now();
                        if session.pong(&bytes).await.is_err() {
                            break;
                        }
                    }

                    Message::Pong(_) => {
                        last_heartbeat = Instant::now();
                    }

                    Message::Close(reason) => {
                        log::info!("WS: session {session_id} close frame: {reason:?}");
                        let _ = session.close(reason).await;
                        break;
                    }

                    Message::Continuation(_) => {
                        // Not supported; ignore.
                    }

                    Message::Nop => {}
                }
            }

            Ok(Some(Err(e))) => {
                log::error!("WS: session {session_id} protocol error: {e}");
                break;
            }
        }
    }

    // -----------------------------------------------------------------
    // Cleanup on disconnect
    // -----------------------------------------------------------------
    log::info!("WS: session {session_id} disconnected — cleaning up");
    audio_mgr.unregister_session(session_id).await;

    let mut reg = registry.lock().await;
    reg.retain(|(id, _)| *id != session_id);
    drop(reg);
}

// ---------------------------------------------------------------------------
// Dispatch a parsed text frame to the appropriate business logic
// ---------------------------------------------------------------------------

async fn handle_text_message(
    session_id: Uuid,
    session: &mut Session,
    text: &str,
    registry: &SessionRegistry,
    queue: &Arc<DialerQueue>,
    audio_mgr: &Arc<AudioManager>,
) {
    let client_msg: ClientMessage = match serde_json::from_str(text) {
        Ok(m) => m,
        Err(e) => {
            log::warn!("WS: session {session_id} bad JSON: {e} — raw: {text}");
            let err = ServerMessage::Error {
                message: format!("Invalid message format: {e}"),
            };
            let _ = send_to(session, &err).await;
            return;
        }
    };

    log::debug!("WS: session {session_id} → {client_msg:?}");

    match client_msg {
        // ----------------------------------------------------------------
        ClientMessage::DialNext => {
            match queue.pop_contact().await {
                Some(contact) => {
                    let msg = ServerMessage::CallStarted {
                        contact_id: contact.id,
                        contact_name: contact.full_name(),
                        phone: contact.phone.clone(),
                    };
                    broadcast(registry, &msg).await;

                    // Follow up with updated queue state
                    let (count, next, _paused, _active) = queue.get_state().await;
                    broadcast(registry, &ServerMessage::QueueUpdate { count, next }).await;
                }
                None => {
                    // Either paused or empty
                    let (count, _next, paused, _active) = queue.get_state().await;
                    let message = if paused {
                        "Queue is paused".to_string()
                    } else if count == 0 {
                        "Queue is empty".to_string()
                    } else {
                        "Unable to dial next contact".to_string()
                    };
                    let _ = send_to(session, &ServerMessage::Error { message }).await;
                }
            }
        }

        // ----------------------------------------------------------------
        ClientMessage::HangUp => {
            if let Some(contact) = queue.end_call().await {
                // Duration tracking requires a call-start timestamp stored per
                // session; the frontend is responsible for precise measurement.
                // We emit 0 as a sentinel — the client will use its own timer.
                let msg = ServerMessage::CallEnded {
                    contact_id: contact.id,
                    duration: 0,
                };
                broadcast(registry, &msg).await;

                let (count, next, _paused, _active) = queue.get_state().await;
                broadcast(registry, &ServerMessage::QueueUpdate { count, next }).await;
            } else {
                let _ = send_to(
                    session,
                    &ServerMessage::Error {
                        message: "No active call to hang up".to_string(),
                    },
                )
                .await;
            }
        }

        // ----------------------------------------------------------------
        ClientMessage::PauseQueue => {
            queue.pause().await;
            broadcast(registry, &ServerMessage::QueuePaused).await;
        }

        // ----------------------------------------------------------------
        ClientMessage::ResumeQueue => {
            queue.resume().await;
            broadcast(registry, &ServerMessage::QueueResumed).await;

            let (count, next, _paused, _active) = queue.get_state().await;
            broadcast(registry, &ServerMessage::QueueUpdate { count, next }).await;
        }

        // ----------------------------------------------------------------
        ClientMessage::SetAudioConfig {
            noise_gate,
            echo_cancel,
        } => {
            audio_mgr
                .set_config(session_id, noise_gate, echo_cancel)
                .await;
            let reply = ServerMessage::AudioConfigSet {
                noise_gate,
                echo_cancel,
            };
            let _ = send_to(session, &reply).await;
        }

        // ----------------------------------------------------------------
        ClientMessage::Authenticate { token } => {
            // Validate token — simple bearer check; extend as needed.
            let username = validate_token(&token);
            match username {
                Some(name) => {
                    log::info!("WS: session {session_id} authenticated as '{name}'");
                    let _ = send_to(
                        session,
                        &ServerMessage::Authenticated { username: name },
                    )
                    .await;
                }
                None => {
                    log::warn!("WS: session {session_id} authentication failed");
                    let _ = send_to(
                        session,
                        &ServerMessage::Error {
                            message: "Authentication failed: invalid token".to_string(),
                        },
                    )
                    .await;
                }
            }
        }

        // ----------------------------------------------------------------
        ClientMessage::AddToQueue { contacts } => {
            let count_added = contacts.len();
            queue.push_bulk(contacts).await;
            log::info!(
                "WS: session {session_id} added {count_added} contacts via WebSocket"
            );
            let (count, next, _paused, _active) = queue.get_state().await;
            broadcast(registry, &ServerMessage::QueueUpdate { count, next }).await;
        }
    }
}

// ---------------------------------------------------------------------------
// Minimal token validator (extend with JWT / DB lookup as needed)
// ---------------------------------------------------------------------------

fn validate_token(token: &str) -> Option<String> {
    // Accepts any non-empty token and returns a synthetic username.
    // Replace with real JWT validation or database lookup.
    if token.is_empty() {
        return None;
    }
    // In production parse a JWT claim here.
    // For now, echo a sanitised version of the token as the username.
    let username = if token.len() > 20 {
        format!("operator_{}", &token[..8])
    } else {
        format!("operator_{}", token)
    };
    Some(username)
}
