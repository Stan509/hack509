"""
Chrome DevTools Protocol (CDP) Controller for Hack509.
Connects directly to the server-side Chromium instance to:
- Read the actively viewed DOM without triggering automated requests
- Handle browser navigation (back, forward, reload, navigate to allowed domains)
- Enforce domain allowlisting
"""
import json
import logging
import requests
import websocket
from .tps_service import is_allowed_url, parse_active_page_dom

logger = logging.getLogger(__name__)

CDP_DEFAULT_HOST = 'browser'
CDP_DEFAULT_PORT = 9222

def get_cdp_targets(host=CDP_DEFAULT_HOST, port=CDP_DEFAULT_PORT):
    """Retrieve active browser targets from CDP HTTP endpoint."""
    try:
        url = f"http://{host}:{port}/json/list"
        resp = requests.get(url, headers={'Host': 'localhost'}, timeout=3)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        logger.warning(f"Failed to query CDP targets on {host}:{port}: {e}")
    return []

def get_active_page(host=CDP_DEFAULT_HOST, port=CDP_DEFAULT_PORT):
    """Find the primary active page target in Chromium."""
    targets = get_cdp_targets(host, port)
    for target in targets:
        if target.get('type') == 'page' and 'webSocketDebuggerUrl' in target:
            # Fix websocket URL to route through host:port
            ws_url = target['webSocketDebuggerUrl']
            if '://localhost/' in ws_url:
                target['webSocketDebuggerUrl'] = ws_url.replace('://localhost/', f'://{host}:{port}/')
            elif '://localhost:' in ws_url:
                import re
                target['webSocketDebuggerUrl'] = re.sub(r'://localhost:\d+/', f'://{host}:{port}/', ws_url)
            elif '://127.0.0.1/' in ws_url:
                target['webSocketDebuggerUrl'] = ws_url.replace('://127.0.0.1/', f'://{host}:{port}/')
            return target
    return None

def send_cdp_command(ws_url: str, method: str, params: dict = None, timeout: int = 5):
    """Execute a synchronous CDP command over WebSocket and return response."""
    ws = None
    try:
        ws = websocket.create_connection(ws_url, host='localhost', timeout=timeout)
        msg_id = 1001
        payload = {
            "id": msg_id,
            "method": method,
            "params": params or {}
        }
        ws.send(json.dumps(payload))
        
        while True:
            raw_res = ws.recv()
            if not raw_res:
                break
            res = json.loads(raw_res)
            if res.get('id') == msg_id:
                return res.get('result', {})
    except Exception as e:
        logger.error(f"CDP command {method} failed: {e}")
        raise
    finally:
        if ws:
            try:
                ws.close()
            except Exception:
                pass
    return {}

def navigate_to_url(target_url: str, host=CDP_DEFAULT_HOST, port=CDP_DEFAULT_PORT):
    """Navigate active tab to an authorized URL strictly."""
    if not is_allowed_url(target_url):
        return {
            'success': False,
            'error': f"Navigation refusée: le domaine de {target_url} n'est pas autorisé."
        }
    
    page = get_active_page(host, port)
    if not page:
        return {'success': False, 'error': 'Navigateur Chromium distant inaccessible.'}
    
    ws_url = page.get('webSocketDebuggerUrl')
    try:
        send_cdp_command(ws_url, "Page.navigate", {"url": target_url})
        return {'success': True, 'url': target_url}
    except Exception as e:
        return {'success': False, 'error': f"Erreur de navigation: {str(e)}"}

def control_browser_action(action: str, host=CDP_DEFAULT_HOST, port=CDP_DEFAULT_PORT):
    """Execute standard browser navigation actions: back, forward, reload, stop."""
    page = get_active_page(host, port)
    if not page:
        return {'success': False, 'error': 'Navigateur Chromium distant inaccessible.'}
    
    ws_url = page.get('webSocketDebuggerUrl')
    
    expr_map = {
        'back': 'window.history.back()',
        'forward': 'window.history.forward()',
        'reload': 'location.reload()',
        'stop': 'window.stop()',
    }
    expr = expr_map.get(action.lower())
    if not expr:
        return {'success': False, 'error': f"Action {action} non reconnue."}
    
    try:
        send_cdp_command(ws_url, "Runtime.evaluate", {"expression": expr})
        return {'success': True, 'action': action}
    except Exception as e:
        return {'success': False, 'error': f"Erreur action navigateur: {str(e)}"}

def evaluate_javascript(expression: str, host=CDP_DEFAULT_HOST, port=CDP_DEFAULT_PORT):
    """Evaluate a JavaScript expression in the active Chromium page and return its value."""
    page = get_active_page(host, port)
    if not page:
        return {'success': False, 'error': 'Navigateur Chromium distant inaccessible.'}
    ws_url = page.get('webSocketDebuggerUrl')
    try:
        res = send_cdp_command(ws_url, "Runtime.evaluate", {
            "expression": expression,
            "returnByValue": True
        })
        val = res.get('result', {}).get('value', '')
        return {'success': True, 'value': val}
    except Exception as e:
        return {'success': False, 'error': str(e)}


def capture_current_page(host=CDP_DEFAULT_HOST, port=CDP_DEFAULT_PORT):
    """
    Extract the visible DOM of the active Chromium page.
    Never navigates to any URL. Extracts only on-screen elements.
    """
    page = get_active_page(host, port)
    if not page:
        return {
            'success': False,
            'error': 'Le navigateur Chromium distant ne répond pas. Vérifiez que la session est ouverte.',
            'results': []
        }
    
    current_url = page.get('url', '')
    ws_url = page.get('webSocketDebuggerUrl')
    
    try:
        res = send_cdp_command(ws_url, "Runtime.evaluate", {
            "expression": "document.documentElement.outerHTML",
            "returnByValue": True
        })
        html = res.get('result', {}).get('value', '')
        if not html:
            return {
                'success': True,
                'count': 0,
                'results': [],
                'message': 'Page active vide ou en cours de chargement.',
                'current_url': current_url
            }
        
        leads = parse_active_page_dom(html, source_url=current_url)
        return {
            'success': True,
            'count': len(leads),
            'results': leads,
            'current_url': current_url,
            'message': f"{len(leads)} fiche(s) reconnue(s) sur la page active." if leads else "Aucune donnée reconnue sur cette page."
        }
    except Exception as e:
        logger.error(f"Failed to capture DOM: {e}")
        return {
            'success': False,
            'error': f"Impossible d'extraire la page: {str(e)}",
            'results': []
        }
