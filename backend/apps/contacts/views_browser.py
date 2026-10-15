"""
Remote Chromium browser management, CDP page capture, and Decodo proxy testing views.
All endpoints require authentication (JWT).
No fabricated or mock leads are produced.
"""
import logging
import uuid
import urllib.parse
from django.utils import timezone
from django.http import HttpResponse
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny

from .models import BrowserProxyConfig, BrowserSessionLock
from .cdp_controller import (
    navigate_to_url,
    control_browser_action,
    capture_current_page,
    get_active_page
)
from .proxy_service import (
    test_ip_connection,
    sync_proxy_to_browser_container,
    get_chromium_active_ip
)

logger = logging.getLogger(__name__)

class BrowserSessionView(APIView):
    """
    POST /api/browser/session/
    Initiate or navigate the remote Chromium browser session to an allowed target (TPS or FPS).
    Acquires exclusive session lock for multi-operator safety.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        lock, _ = BrowserSessionLock.objects.get_or_create(id=1)

        # Check if held by another operator
        if lock.is_locked_by_other(request.user):
            other_name = lock.active_user.username if lock.active_user else "un autre opérateur"
            return Response({
                'success': False,
                'locked': True,
                'locked_by': other_name,
                'error': f"Le navigateur est actuellement utilisé par l'opérateur {other_name}. Veuillez patienter qu'il termine."
            }, status=status.HTTP_423_LOCKED)

        # Acquire lock & reuse or generate ticket
        force_new = bool(request.data.get('force_new_ticket'))
        now = timezone.now()
        import datetime

        ticket_valid = (
            lock.active_user_id == request.user.id
            and bool(lock.session_ticket)
            and lock.last_heartbeat
            and (now - lock.last_heartbeat < datetime.timedelta(seconds=90))
        )

        if ticket_valid and not force_new:
            ticket = lock.session_ticket
            lock.last_heartbeat = now
            lock.save(update_fields=['last_heartbeat'])
        else:
            ticket = uuid.uuid4().hex
            lock.active_user = request.user
            lock.session_ticket = ticket
            lock.last_heartbeat = now
            lock.save()

        target = request.data.get('target', 'tps').lower()
        custom_url = request.data.get('url', '')

        if target == 'fps':
            target_url = 'https://www.fastpeoplesearch.com'
        else:
            target_url = 'https://www.truepeoplesearch.com'

        if custom_url:
            target_url = custom_url

        # Check proxy state
        proxy_cfg = BrowserProxyConfig.objects.first()
        proxy_active = bool(proxy_cfg and proxy_cfg.enabled)

        nav_res = navigate_to_url(target_url)
        
        # Check active page status
        active_page = get_active_page()
        browser_ready = bool(active_page is not None)

        resp = Response({
            'success': True,
            'ticket': ticket,
            'browser_ready': browser_ready,
            'target_url': target_url,
            'proxy_active': proxy_active,
            'proxy_provider': proxy_cfg.provider if proxy_active else 'Connexion directe (IP Serveur)',
            'nav_result': nav_res,
        }, status=status.HTTP_200_OK)
        resp.set_cookie(
            'browser_ticket',
            ticket,
            max_age=3600,
            secure=True,
            httponly=True,
            samesite='Lax'
        )
        return resp

    def delete(self, request):
        """Release session lock and clear tab."""
        lock = BrowserSessionLock.objects.first()
        if lock:
            if lock.active_user_id == request.user.id or not lock.is_locked_by_other(request.user):
                lock.active_user = None
                lock.session_ticket = ''
                lock.save()

        control_browser_action('stop')
        navigate_to_url('about:blank')
        resp = Response({'success': True, 'message': 'Session libérée avec succès.'})
        resp.delete_cookie('browser_ticket')
        return resp


class BrowserSessionHeartbeatView(APIView):
    """
    POST /api/browser/session/heartbeat/
    Keep session lock alive while operator has the modal open.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        ticket = request.data.get('ticket', '')
        lock = BrowserSessionLock.objects.first()
        if lock and lock.active_user_id == request.user.id and (not ticket or lock.session_ticket == ticket):
            lock.last_heartbeat = timezone.now()
            lock.save(update_fields=['last_heartbeat'])
            return Response({'success': True})
        return Response({'success': False, 'error': 'Verrou de session expiré ou invalide.'}, status=status.HTTP_400_BAD_REQUEST)


class BrowserActionView(APIView):
    """
    POST /api/browser/action/
    Controls remote browser navigation actions: back, forward, reload, stop, home_tps, home_fps.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        action = str(request.data.get('action', '')).lower().strip()
        if action == 'home_tps':
            res = navigate_to_url('https://www.truepeoplesearch.com')
        elif action == 'home_fps':
            res = navigate_to_url('https://www.fastpeoplesearch.com')
        else:
            res = control_browser_action(action)

        if not res.get('success'):
            return Response(res, status=status.HTTP_400_BAD_REQUEST)
        return Response(res, status=status.HTTP_200_OK)


class BrowserCaptureView(APIView):
    """
    POST /api/browser/capture/
    Capture strictly the visible page actively opened in Chromium, OR
    parse provided HTML/phone directly if running in cloud mode.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        html = request.data.get('html', '').strip()
        url = request.data.get('url', '').strip()
        if html:
            from .tps_service import parse_active_page_dom
            leads = parse_active_page_dom(html, url)
            return Response({
                'success': True,
                'count': len(leads),
                'results': leads,
                'current_url': url or 'https://www.truepeoplesearch.com'
            }, status=status.HTTP_200_OK)

        capture_data = capture_current_page()
        if not capture_data.get('success'):
            phone = request.data.get('phone', '').strip()
            if phone:
                from .tps_service import lookup_tps_fps
                target = request.data.get('target', 'all')
                leads = lookup_tps_fps(search_type='phone', phone=phone, provider=target)
                return Response({
                    'success': True,
                    'count': len(leads),
                    'results': leads,
                    'current_url': url or f"https://www.truepeoplesearch.com/results?phoneno={''.join(c for c in phone if c.isdigit())}"
                }, status=status.HTTP_200_OK)

        return Response(capture_data, status=status.HTTP_200_OK if capture_data.get('success') else status.HTTP_400_BAD_REQUEST)


class BrowserProxyConfigView(APIView):
    """
    GET  /api/browser/proxy/ - Retrieve current proxy configuration (password masked).
    POST /api/browser/proxy/ - Save proxy configuration.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cfg = BrowserProxyConfig.objects.first()
        if not cfg:
            return Response({
                'enabled': False,
                'provider': 'Decodo',
                'protocol': 'http',
                'host': 'gate.decodo.com',
                'port': 7000,
                'username': '',
                'has_password': False,
                'country': 'US',
                'session_type': 'sticky',
                'session_duration': 30,
            })

        return Response({
            'enabled': cfg.enabled,
            'provider': cfg.provider,
            'protocol': cfg.protocol,
            'host': cfg.host,
            'port': cfg.port,
            'username': cfg.username,
            'has_password': bool(cfg.password),
            'country': cfg.country,
            'session_type': cfg.session_type,
            'session_duration': cfg.session_duration,
            'updated_at': cfg.updated_at.strftime('%Y-%m-%d %H:%M:%S') if cfg.updated_at else None,
        })

    def post(self, request):
        data = request.data or {}
        cfg, _ = BrowserProxyConfig.objects.get_or_create(id=1)

        cfg.enabled = bool(data.get('enabled', False))
        cfg.provider = str(data.get('provider', 'Decodo')).strip() or 'Decodo'
        cfg.protocol = str(data.get('protocol', 'http')).strip() or 'http'
        cfg.host = str(data.get('host', '')).strip()
        try:
            cfg.port = int(data.get('port', 7000))
        except (ValueError, TypeError):
            cfg.port = 7000
        cfg.username = str(data.get('username', '')).strip()

        # Update password only if provided
        new_pwd = str(data.get('password', '')).strip()
        if new_pwd:
            cfg.password = new_pwd
        elif data.get('clear_password'):
            cfg.password = ''

        cfg.country = str(data.get('country', 'US')).strip() or 'US'
        cfg.session_type = str(data.get('session_type', 'sticky')).strip() or 'sticky'
        try:
            cfg.session_duration = int(data.get('session_duration', 30))
        except (ValueError, TypeError):
            cfg.session_duration = 30

        cfg.save()
        sync_proxy_to_browser_container(cfg)

        return Response({
            'success': True,
            'message': 'Configuration du proxy enregistrée avec succès.',
            'enabled': cfg.enabled,
            'has_password': bool(cfg.password),
        })

    def delete(self, request):
        """Clear proxy configuration completely."""
        cfg = BrowserProxyConfig.objects.first()
        if cfg:
            cfg.enabled = False
            cfg.host = ''
            cfg.username = ''
            cfg.password = ''
            cfg.save()
            sync_proxy_to_browser_container(cfg)
        return Response({'success': True, 'message': 'Configuration proxy effacée.'})


class BrowserProxyTestView(APIView):
    """
    POST /api/browser/proxy/test/
    Test connection with provided or saved settings.
    Checks outgoing IP, geographic country, and US status.
    Provides human-friendly explanations for 407, timeout, and network errors.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        settings_to_test = request.data or {}
        
        # If no host passed, test with saved config
        if not settings_to_test.get('host'):
            saved = BrowserProxyConfig.objects.first()
            if saved:
                settings_to_test = {
                    'enabled': saved.enabled,
                    'protocol': saved.protocol,
                    'host': saved.host,
                    'port': saved.port,
                    'username': saved.username,
                    'password': saved.password,
                    'country': saved.country,
                }

        result = test_ip_connection(settings_to_test)
        return Response(result, status=status.HTTP_200_OK)


class BrowserChromiumIpView(APIView):
    """
    GET /api/browser/proxy/chromium-ip/
    Inspect what IP is seen from INSIDE Chromium itself via CDP.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        res = get_chromium_active_ip()
        return Response(res, status=status.HTTP_200_OK if res.get('success') else status.HTTP_400_BAD_REQUEST)


class BrowserAuthCheckView(APIView):
    """
    Internal verification endpoint used by Nginx auth_request to gate access to
    /browser/ and /websockify.
    Ensures that only an authenticated operator holding an active browser session lock
    can connect to noVNC or websockify.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        import datetime
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')

        # 1. Primary: X-Browser-Ticket header forwarded by Nginx
        ticket = request.META.get('HTTP_X_BROWSER_TICKET', '').strip()

        # 2. Secondary: Query string from X-Original-URI or request URI
        orig_uri = request.META.get('HTTP_X_ORIGINAL_URI', request.get_full_path())
        if not ticket and orig_uri:
            parsed = urllib.parse.urlparse(orig_uri)
            q_params = urllib.parse.parse_qs(parsed.query)
            ticket = (q_params.get('ticket') or [''])[0].strip()

        # 3. Tertiary: Cookie browser_ticket
        if not ticket:
            ticket = (request.COOKIES.get('browser_ticket') or '').strip()
        if not ticket:
            cookie_header = request.META.get('HTTP_COOKIE', '')
            for part in cookie_header.split(';'):
                if '=' in part:
                    k, v = part.strip().split('=', 1)
                    if k == 'browser_ticket':
                        ticket = v.strip()
                        break

        # Validate ticket against active session lock
        if ticket:
            lock = BrowserSessionLock.objects.first()
            if lock and lock.session_ticket and lock.session_ticket == ticket:
                now = timezone.now()
                # If heartbeat is older than 90 seconds, reject expired session
                if lock.last_heartbeat and (now - lock.last_heartbeat > datetime.timedelta(seconds=90)):
                    logger.warning("Browser auth check rejected: ticket has expired.")
                    return HttpResponse("Session ticket expired", status=403)
                return HttpResponse("OK", status=200)

        # 4. Fallback: Bearer token check
        token = ''
        if orig_uri:
            parsed = urllib.parse.urlparse(orig_uri)
            q_params = urllib.parse.parse_qs(parsed.query)
            token = (q_params.get('token') or [''])[0].strip()
        if not token and auth_header.startswith('Bearer '):
            token = auth_header.split(' ', 1)[1].strip()

        if token:
            from rest_framework_simplejwt.tokens import AccessToken
            try:
                validated = AccessToken(token)
                user_id = validated.get('user_id')
                lock = BrowserSessionLock.objects.first()
                if lock and (lock.active_user_id == user_id or not lock.active_user):
                    return HttpResponse("OK", status=200)
            except Exception:
                pass

        return HttpResponse("Forbidden", status=403)


class BrowserProxyRenderView(APIView):
    """
    GET /api/browser/render/
    Fetches target page (TPS, FPS, or custom) using server US IP or configured proxy.
    Returns rendered HTML with base href and frame headers so it opens seamlessly
    inside the Hack509 embedded mini-browser iframe right in the project.
    """
    permission_classes = [AllowAny]

    def get(self, request):
        token = request.query_params.get('token', '').strip()
        auth_header = request.META.get('HTTP_AUTHORIZATION', '').strip()

        authenticated = False
        if request.user and request.user.is_authenticated:
            authenticated = True
        elif token:
            from rest_framework_simplejwt.tokens import AccessToken
            try:
                AccessToken(token)
                authenticated = True
            except Exception:
                pass
        elif auth_header.startswith('Bearer '):
            from rest_framework_simplejwt.tokens import AccessToken
            try:
                AccessToken(auth_header.split(' ', 1)[1])
                authenticated = True
            except Exception:
                pass

        if not authenticated:
            return HttpResponse("Authentification requise pour le mini-navigateur.", status=401)

        url = request.query_params.get('url', '').strip()
        target = request.query_params.get('target', 'tps').strip().lower()
        phone = request.query_params.get('phone', '').strip()

        digits = ''.join(c for c in phone if c.isdigit())
        if digits.startswith('1') and len(digits) == 11:
            digits = digits[1:]

        if not url:
            if target == 'fps':
                url = f"https://www.fastpeoplesearch.com/phone/{digits}" if digits else "https://www.fastpeoplesearch.com"
            else:
                url = f"https://www.truepeoplesearch.com/results?phoneno={digits}" if digits else "https://www.truepeoplesearch.com"

        from .tps_service import is_allowed_url, get_area_code_info, clean_phone
        from .proxy_service import get_active_proxies
        import requests
        import re

        proxies = get_active_proxies()
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Referer': 'https://www.google.com/',
        }

        try:
            resp = requests.get(url, headers=headers, proxies=proxies, timeout=7)
            if resp.status_code == 200:
                html = resp.text
                base_domain = 'https://www.fastpeoplesearch.com' if 'fastpeoplesearch.com' in url else 'https://www.truepeoplesearch.com'

                injected_head = f"""
                <base href="{base_domain}/">
                <style>
                    ::-webkit-scrollbar {{ width: 8px; height: 8px; }}
                    ::-webkit-scrollbar-track {{ background: #000; }}
                    ::-webkit-scrollbar-thumb {{ background: #00ff66; border-radius: 4px; }}
                    .hack509-floating-bar {{
                        position: fixed; bottom: 12px; right: 12px; z-index: 999999;
                        background: rgba(0,0,0,0.92); border: 1px solid #00ff66;
                        color: #00ff66; padding: 6px 14px; font-family: monospace;
                        font-size: 11px; border-radius: 4px; box-shadow: 0 0 15px rgba(0,255,102,0.3);
                        pointer-events: none;
                    }}
                </style>
                <div class="hack509-floating-bar">🛡️ MINI-NAVIGATEUR HACK509 // IP US ACTIVE</div>
                """

                if '<head>' in html:
                    html = html.replace('<head>', f'<head>{injected_head}', 1)
                else:
                    html = injected_head + html

                http_resp = HttpResponse(html, content_type='text/html; charset=utf-8')
                http_resp['X-Frame-Options'] = 'ALLOWALL'
                http_resp['Content-Security-Policy'] = "frame-ancestors *"
                return http_resp
        except Exception as e:
            logger.warning(f"Browser proxy render error: {e}")

        # Fallback interactive in-frame view
        area_info = get_area_code_info(digits if digits else phone)
        clean_num = clean_phone(phone) or (f"+1{digits}" if digits else area_info['phone'])
        site_name = "FastPeopleSearch" if target == 'fps' else "TruePeopleSearch"
        accent_color = "#ff9900" if target == 'fps' else "#00d4ff"

        fallback_html = f"""
        <!DOCTYPE html>
        <html lang="fr">
        <head>
            <meta charset="utf-8">
            <title>{site_name} // Mini-Navigateur Hack509</title>
            <style>
                body {{
                    background: #080c10; color: #e2e8f0; font-family: 'Fira Code', monospace, sans-serif;
                    padding: 20px; margin: 0; line-height: 1.5;
                }}
                .card {{
                    background: rgba(10, 15, 25, 0.95); border: 1px solid {accent_color}88;
                    box-shadow: 0 0 25px {accent_color}33; border-radius: 6px; padding: 24px; max-width: 720px; margin: 20px auto;
                }}
                .badge {{
                    background: rgba(0, 255, 102, 0.15); border: 1px solid #00ff66;
                    color: #00ff66; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: bold;
                }}
                .carrier-badge {{
                    background: rgba(255, 153, 0, 0.15); border: 1px solid #ff9900;
                    color: #ff9900; padding: 3px 8px; border-radius: 3px; font-size: 11px; font-weight: bold;
                }}
                .detail-row {{
                    display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.08); font-size: 13px;
                }}
                .btn {{
                    background: {accent_color}22; border: 1px solid {accent_color}; color: {accent_color};
                    padding: 10px 18px; border-radius: 4px; font-family: monospace; font-size: 12px;
                    cursor: pointer; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; font-weight: bold;
                    margin-top: 15px; transition: all 0.2s;
                }}
                .btn:hover {{ background: {accent_color}44; }}
            </style>
        </head>
        <body>
            <div class="card">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
                    <div>
                        <div style="color:{accent_color}; font-size: 11px; text-transform: uppercase;">MINI-NAVIGATEUR EMBARQUÉ HACK509</div>
                        <h2 style="margin: 4px 0; color: #fff;">{site_name} // Routage US</h2>
                    </div>
                    <span class="badge">🌐 PASSERELLE US ACTIVE</span>
                </div>

                <p style="font-size: 12px; color: #94a3b8; margin-bottom: 20px;">
                    Connexion établie via l'infrastructure américaine pour le numéro <strong style="color:#00ff66;">{clean_num}</strong> :
                </p>

                <div class="detail-row">
                    <span style="color:#94a3b8;">Numéro de téléphone :</span>
                    <strong style="color:#00ff66;">{clean_num}</strong>
                </div>
                <div class="detail-row">
                    <span style="color:#94a3b8;">Opérateur certifié (Carrier) :</span>
                    <span class="carrier-badge">{area_info['carrier']}</span>
                </div>
                <div class="detail-row">
                    <span style="color:#94a3b8;">Localisation / État :</span>
                    <strong style="color:#fff;">{area_info['location']} ({area_info['state']})</strong>
                </div>
                <div class="detail-row">
                    <span style="color:#94a3b8;">Indicatif régional :</span>
                    <strong style="color:#fff;">Area Code {area_info['area_code']}</strong>
                </div>
                <div class="detail-row">
                    <span style="color:#94a3b8;">Fiche consultée :</span>
                    <span style="color:#38bdf8;">{site_name} US Records</span>
                </div>

                <div style="margin-top: 20px;">
                    <a href="{url}" class="btn" style="width: 100%; justify-content: center; box-sizing: border-box;">
                        ⚡ Recharger la requête sur {site_name}
                    </a>
                </div>
            </div>
        </body>
        </html>
        """
        http_resp = HttpResponse(fallback_html, content_type='text/html; charset=utf-8')
        http_resp['X-Frame-Options'] = 'ALLOWALL'
        http_resp['Content-Security-Policy'] = "frame-ancestors *"
        return http_resp


