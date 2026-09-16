"""
Proxy management and connection diagnostics service.
Supports natural server IP verification and Decodo / custom HTTP proxy validation.
Never prints or leaks credentials to logs or unsecured responses.
"""
import os
import json
import logging
import requests
from .models import BrowserProxyConfig

logger = logging.getLogger(__name__)

PROXY_ENV_FILE = "/data/proxy.env"

def test_ip_connection(proxy_settings: dict = None):
    """
    Test outgoing IP, location, and US detection.
    If proxy_settings is empty or enabled is False, tests natural server IP.
    Returns:
    {
        'success': bool,
        'ip': str,
        'country': str,
        'is_us': bool,
        'city': str,
        'isp': str,
        'mode': 'direct' | 'proxy',
        'error': str or None
    }
    """
    cfg = proxy_settings or {}
    use_proxy = cfg.get('enabled', False) and bool(cfg.get('host'))
    
    proxies = None
    if use_proxy:
        proto = cfg.get('protocol', 'http').lower()
        host = cfg.get('host', '').strip()
        port = cfg.get('port', 7000)
        user = cfg.get('username', '').strip()
        pwd = cfg.get('password', '').strip()
        
        if user and pwd:
            proxy_url = f"{proto}://{user}:{pwd}@{host}:{port}"
        elif user:
            proxy_url = f"{proto}://{user}@{host}:{port}"
        else:
            proxy_url = f"{proto}://{host}:{port}"
        
        proxies = {
            'http': proxy_url,
            'https': proxy_url
        }

    # Use IP diagnostic API
    test_urls = [
        'https://ipinfo.io/json',
        'http://ip-api.com/json',
    ]

    last_error = None
    for target in test_urls:
        try:
            resp = requests.get(target, proxies=proxies, timeout=8)
            if resp.status_code == 407:
                return {
                    'success': False,
                    'mode': 'proxy' if use_proxy else 'direct',
                    'error': 'Erreur 407: Authentification proxy requise. Vos identifiants Decodo sont invalides ou expirés.'
                }
            if resp.status_code == 200:
                data = resp.json()
                ip = data.get('ip') or data.get('query') or 'Inconnue'
                country = data.get('country') or data.get('countryCode') or 'Inconnu'
                city = data.get('city') or ''
                isp = data.get('org') or data.get('isp') or ''
                is_us = (country.upper() in ('US', 'USA', 'UNITED STATES'))

                return {
                    'success': True,
                    'ip': ip,
                    'country': country.upper(),
                    'is_us': is_us,
                    'city': city,
                    'isp': isp,
                    'mode': 'proxy' if use_proxy else 'direct',
                    'error': None
                }
        except requests.exceptions.ProxyError as pe:
            err_msg = str(pe)
            if '407' in err_msg:
                last_error = 'Erreur 407: Authentification proxy rejetée (nom d’utilisateur ou mot de passe incorrect).'
            else:
                last_error = f"Erreur de connexion proxy: impossible de joindre l’hôte {cfg.get('host')}."
        except requests.exceptions.ConnectTimeout:
            last_error = 'Délai d’attente dépassé (Timeout): le serveur proxy ne répond pas.'
        except requests.exceptions.RequestException as re:
            last_error = f"Erreur réseau: {str(re)}"

    return {
        'success': False,
        'mode': 'proxy' if use_proxy else 'direct',
        'error': last_error or 'Impossible de vérifier la connexion réseau.'
    }

def restart_chromium_process():
    """Trigger clean supervisor restart of Chromium in browser container."""
    import xmlrpc.client
    import time
    try:
        server = xmlrpc.client.ServerProxy('http://browser:9001/RPC2')
        try:
            server.supervisor.stopProcess('chromium')
        except Exception:
            pass
        time.sleep(0.5)
        server.supervisor.startProcess('chromium')
        logger.info("Chromium restarted cleanly via supervisor XML-RPC.")
        return True
    except Exception as e:
        logger.warning(f"Could not signal supervisor to restart Chromium: {e}")
        return False

def sync_proxy_to_browser_container(config_obj: BrowserProxyConfig):
    """Write proxy environment for the Chromium container if active and restart browser."""
    try:
        os.makedirs('/data', exist_ok=True)
        if config_obj.enabled and config_obj.host:
            with open(PROXY_ENV_FILE, 'w') as f:
                f.write("export BROWSER_PROXY_ENABLED='1'\n")
                f.write(f"export BROWSER_PROXY_HOST='{config_obj.host}'\n")
                f.write(f"export BROWSER_PROXY_PORT='{config_obj.port}'\n")
                f.write(f"export BROWSER_PROXY_USER='{config_obj.username}'\n")
                f.write(f"export BROWSER_PROXY_PASS='{config_obj.password}'\n")
        else:
            with open(PROXY_ENV_FILE, 'w') as f:
                f.write("export BROWSER_PROXY_ENABLED='0'\n")

        # Signal supervisor to restart Chromium with new proxy config
        restart_chromium_process()
    except Exception as e:
        logger.warning(f"Could not update {PROXY_ENV_FILE}: {e}")

def get_chromium_active_ip():
    """
    Directly navigate Chromium via CDP to an IP check endpoint and read what IP
    is seen from inside the browser itself.
    """
    import json
    import time
    from .cdp_controller import navigate_to_url, evaluate_javascript

    nav_res = navigate_to_url("https://ipinfo.io/json")
    if not nav_res.get('success'):
        return {'success': False, 'error': nav_res.get('error', 'Navigation échouée')}

    # Wait 2 seconds for response to render
    time.sleep(2)

    eval_res = evaluate_javascript("document.body ? document.body.innerText : ''")
    if not eval_res.get('success'):
        return {'success': False, 'error': "Impossible d'extraire la réponse IP de Chromium"}

    raw_text = eval_res.get('value', '').strip()
    try:
        data = json.loads(raw_text)
        ip = data.get('ip') or data.get('query') or 'Inconnue'
        country = data.get('country') or data.get('countryCode') or 'Inconnu'
        is_us = (str(country).upper() in ('US', 'USA', 'UNITED STATES'))
        return {
            'success': True,
            'ip': ip,
            'country': str(country).upper(),
            'is_us': is_us,
            'city': data.get('city', ''),
            'isp': data.get('org') or data.get('isp', ''),
            'raw': raw_text
        }
    except Exception as e:
        return {'success': False, 'error': f"Format JSON inattendu depuis Chromium: {raw_text[:200]}"}


