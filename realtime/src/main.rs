mod audio;
mod models;
mod queue;
mod ws;

use actix_web::{middleware, web, App, HttpRequest, HttpResponse, HttpServer};
use audio::AudioManager;
use models::{AddContactsRequest, ContactInfo, QueueStatusResponse};
use queue::DialerQueue;
use std::sync::Arc;
use ws::{new_registry, ws_handler, SessionRegistry};

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

async fn health() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "online",
        "service": "HACKER509-REALTIME",
        "creator": "LH5 Leley Hacker 509"
    }))
}

// ---------------------------------------------------------------------------
// WebSocket upgrade endpoint
// ---------------------------------------------------------------------------

async fn dialer_ws(
    req: HttpRequest,
    body: web::Payload,
    queue: web::Data<Arc<DialerQueue>>,
    registry: web::Data<SessionRegistry>,
    audio_mgr: web::Data<Arc<AudioManager>>,
) -> actix_web::Result<HttpResponse> {
    let peer = req
        .connection_info()
        .peer_addr()
        .unwrap_or("unknown")
        .to_string();
    log::info!("WS: upgrade request from {peer}");

    let (response, session, msg_stream) = actix_ws::handle(&req, body)?;

    // Spawn the handler so it runs concurrently with other requests.
    actix_web::rt::spawn(ws_handler(
        session,
        msg_stream,
        registry,
        queue,
        audio_mgr,
    ));

    Ok(response)
}

// ---------------------------------------------------------------------------
// REST – GET /api/queue/
// ---------------------------------------------------------------------------

async fn get_queue(queue: web::Data<Arc<DialerQueue>>) -> HttpResponse {
    let (count, next, paused, active_call) = queue.get_state().await;
    HttpResponse::Ok().json(QueueStatusResponse {
        count,
        paused,
        active_call,
        next,
    })
}

// ---------------------------------------------------------------------------
// REST – POST /api/queue/add
// ---------------------------------------------------------------------------

async fn add_to_queue(
    queue: web::Data<Arc<DialerQueue>>,
    registry: web::Data<SessionRegistry>,
    body: web::Json<AddContactsRequest>,
) -> HttpResponse {
    let contacts: Vec<ContactInfo> = body.into_inner().contacts;
    let n = contacts.len();
    log::info!("REST: adding {n} contacts to queue");

    queue.push_bulk(contacts).await;

    let (count, next, _paused, _active) = queue.get_state().await;
    // Notify all connected WebSocket clients.
    ws::broadcast(
        &registry,
        &models::ServerMessage::QueueUpdate { count, next },
    )
    .await;

    HttpResponse::Ok().json(serde_json::json!({
        "added": n,
        "queue_length": count
    }))
}

// ---------------------------------------------------------------------------
// REST – DELETE /api/queue/clear
// ---------------------------------------------------------------------------

async fn clear_queue(
    queue: web::Data<Arc<DialerQueue>>,
    registry: web::Data<SessionRegistry>,
) -> HttpResponse {
    queue.clear().await;
    log::info!("REST: queue cleared");

    let (count, next, _paused, _active) = queue.get_state().await;
    ws::broadcast(
        &registry,
        &models::ServerMessage::QueueUpdate { count, next },
    )
    .await;

    HttpResponse::Ok().json(serde_json::json!({
        "status": "cleared",
        "queue_length": count
    }))
}

// ---------------------------------------------------------------------------
// OPTIONS preflight handler (CORS)
// ---------------------------------------------------------------------------

async fn options_handler() -> HttpResponse {
    HttpResponse::Ok()
        .insert_header(("Access-Control-Allow-Origin", "*"))
        .insert_header(("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS"))
        .insert_header(("Access-Control-Allow-Headers", "Content-Type, Authorization"))
        .finish()
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Initialise logger — set RUST_LOG=info or debug to control verbosity.
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    log::info!("╔══════════════════════════════════════╗");
    log::info!("║  HACKER509-REALTIME  ·  port 8001    ║");
    log::info!("║  by LH5 Leley Hacker 509             ║");
    log::info!("╚══════════════════════════════════════╝");

    // Shared state — wrapped in Arc so Actix can clone Data handles cheaply.
    let queue = Arc::new(DialerQueue::new());
    let registry = new_registry();
    let audio_mgr = Arc::new(AudioManager::new());

    let queue_data = web::Data::new(queue.clone());
    let registry_data = web::Data::new(registry.clone());
    let audio_data = web::Data::new(audio_mgr.clone());

    HttpServer::new(move || {
        App::new()
            // Request logger
            .wrap(middleware::Logger::new("%a \"%r\" %s %b %D ms"))
            // CORS headers via DefaultHeaders middleware
            .wrap(
                middleware::DefaultHeaders::new()
                    .add(("Access-Control-Allow-Origin", "*"))
                    .add(("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS"))
                    .add(("Access-Control-Allow-Headers", "Content-Type, Authorization")),
            )
            // Inject shared state
            .app_data(queue_data.clone())
            .app_data(registry_data.clone())
            .app_data(audio_data.clone())
            // Accept large JSON payloads (bulk contact imports)
            .app_data(web::JsonConfig::default().limit(10 * 1024 * 1024))
            // Health check
            .route("/health", web::get().to(health))
            // WebSocket routes
            .route("/ws/dialer/", web::get().to(dialer_ws))
            .route("/dialer/", web::get().to(dialer_ws))
            .route("/ws/", web::get().to(dialer_ws))
            .route("/ws", web::get().to(dialer_ws))
            // REST queue routes
            .route("/api/queue/", web::get().to(get_queue))
            .route("/queue/", web::get().to(get_queue))
            .route("/api/queue/add", web::post().to(add_to_queue))
            .route("/queue/add", web::post().to(add_to_queue))
            .route("/api/queue/clear", web::delete().to(clear_queue))
            .route("/queue/clear", web::delete().to(clear_queue))
            // CORS OPTIONS preflight for all paths
            .route(
                "/{tail:.*}",
                web::method(actix_web::http::Method::OPTIONS).to(options_handler),
            )
    })
    .bind("0.0.0.0:8001")?
    .workers(4)
    .run()
    .await
}
