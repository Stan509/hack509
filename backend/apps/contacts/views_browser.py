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

        # Acquire lock & generate ticket
        ticket = uuid.uuid4().hex
        lock.active_user = request.user
        lock.session_ticket = ticket
        lock.last_heartbeat = timezone.now()
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

        return Response({
            'success': True,
            'ticket': ticket,
            'browser_ready': browser_ready,
            'target_url': target_url,
            'proxy_active': proxy_active,
            'proxy_provider': proxy_cfg.provider if proxy_active else 'Connexion directe (IP Serveur)',
            'nav_result': nav_res,
        }, status=status.HTTP_200_OK)

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
        return Response({'success': True, 'message': 'Session libérée avec succès.'})


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
    Capture strictly the visible page actively opened in Chromium.
    Does NOT navigate or iterate multiple pages automatically.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        capture_data = capture_current_page()
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
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        orig_uri = request.META.get('HTTP_X_ORIGINAL_URI', request.get_full_path())
        parsed = urllib.parse.urlparse(orig_uri)
        q_params = urllib.parse.parse_qs(parsed.query)

        ticket = (q_params.get('ticket') or [''])[0]
        token = (q_params.get('token') or [''])[0]

        # 1. Check valid session lock ticket
        if ticket:
            lock = BrowserSessionLock.objects.first()
            if lock and lock.session_ticket == ticket and not lock.is_locked_by_other(lock.active_user):
                return HttpResponse("OK", status=200)

        # 2. Check Bearer token
        raw_token = token
        if not raw_token and auth_header.startswith('Bearer '):
            raw_token = auth_header.split(' ', 1)[1].strip()

        if raw_token:
            from rest_framework_simplejwt.tokens import AccessToken
            try:
                validated = AccessToken(raw_token)
                user_id = validated.get('user_id')
                lock = BrowserSessionLock.objects.first()
                if lock and (lock.active_user_id == user_id or not lock.active_user):
                    return HttpResponse("OK", status=200)
            except Exception:
                pass

        return HttpResponse("Forbidden", status=403)

