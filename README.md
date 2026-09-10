# HACKER509 — Scripts de démarrage
# Créé par LH5 Leley Hacker 509
# =============================================================================

## Démarrer tous les services

### Terminal 1 — Django API (port 8000)
```powershell
cd c:\Users\stanl\OneDrive\Documents\hack509\backend
python manage.py runserver 8000
```

### Terminal 2 — Rust WebSocket (port 8001)
```powershell
cd c:\Users\stanl\OneDrive\Documents\hack509\realtime
cargo run
```

### Terminal 3 — React Frontend (port 5173)
```powershell
cd c:\Users\stanl\OneDrive\Documents\hack509\frontend
npm run dev
```

## URLs
- Frontend : http://localhost:5173
- API Django : http://localhost:8000/api/
- WebSocket Rust : ws://localhost:8001/ws/dialer/
- Django Admin : http://localhost:8000/admin/

## Login par défaut
- Username : admin
- Password : hacker509

## Variables d'environnement (backend/.env)
Copier .env.example → .env et remplir les valeurs Twilio
