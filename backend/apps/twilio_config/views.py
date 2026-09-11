"""
Twilio Config views - Configuration management and Access Token generation.
"""
import uuid
import logging
import os
import json

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from django.conf import settings

from apps.accounts.permissions import IsAdmin
from .models import TwilioConfig
from .serializers import TwilioConfigSerializer, TwilioConfigWriteSerializer

logger = logging.getLogger(__name__)

CONFIG_FILE_PATH = os.path.join(settings.BASE_DIR, '.twilio_saved_config.json')

def save_persistent_config(data):
    try:
        with open(CONFIG_FILE_PATH, 'w') as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.warning(f"Could not save persistent twilio config: {e}")

def load_persistent_config():
    if os.path.exists(CONFIG_FILE_PATH):
        try:
            with open(CONFIG_FILE_PATH, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Could not load persistent twilio config: {e}")
    return None

def auto_provision_twilio_keys(config):
    """
    Auto-provision Twilio API Key (SK...) and TwiML App (AP...) if missing.
    Requires valid account_sid (AC...) and auth_token.
    """
    if not config or not config.account_sid or not config.account_sid.startswith('AC') or not config.auth_token:
        return config

    try:
        from twilio.rest import Client
        client = Client(config.account_sid, config.auth_token)
        modified = False

        # 1. Create API Key SID (SK...) if missing
        if not config.api_key_sid or not config.api_key_sid.startswith('SK') or not config.api_key_secret:
            logger.info("Auto-provisioning Twilio API Key (SK...) for Voice SDK...")
            new_key = client.new_keys.create(friendly_name='Hacker509 Call Center Key')
            config.api_key_sid = new_key.sid
            config.api_key_secret = new_key.secret
            modified = True
            logger.info("Auto-provisioned API Key SID: %s", new_key.sid)

        # 2. Create TwiML App SID (AP...) if missing
        if not config.twiml_app_sid or not config.twiml_app_sid.startswith('AP'):
            logger.info("Auto-provisioning TwiML App (AP...) for outbound voice calls...")
            voice_url = 'https://hack509-app-pezir.ondigitalocean.app/api/calls/twiml/'
            new_app = client.applications.create(
                friendly_name='Hacker509 Voice Application',
                voice_url=voice_url,
                voice_method='POST'
            )
            config.twiml_app_sid = new_app.sid
            modified = True
            logger.info("Auto-provisioned TwiML App SID: %s", new_app.sid)

        if modified:
            config.save()
            save_data = {
                'account_sid': config.account_sid,
                'auth_token': config.auth_token,
                'phone_number': config.phone_number,
                'twiml_app_sid': config.twiml_app_sid,
                'api_key_sid': config.api_key_sid,
                'api_key_secret': config.api_key_secret,
            }
            save_persistent_config(save_data)
    except Exception as e:
        logger.warning(f"Auto-provisioning Twilio keys warning: {e}")

    return config

def get_effective_config():
    """
    Returns effective Twilio configuration.
    Prefers environment variables, then DB record, then persistent backup file.
    """
    env_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    env_token = os.environ.get('TWILIO_AUTH_TOKEN')
    env_phone = os.environ.get('TWILIO_PHONE_NUMBER')
    env_app_sid = os.environ.get('TWILIO_TWIML_APP_SID')
    env_key_sid = os.environ.get('TWILIO_API_KEY_SID')
    env_key_secret = os.environ.get('TWILIO_API_KEY_SECRET')

    if env_sid and (env_token or env_key_secret):
        return {
            'account_sid': env_sid,
            'auth_token': env_token or '',
            'phone_number': env_phone or '',
            'twiml_app_sid': env_app_sid or '',
            'api_key_sid': env_key_sid or '',
            'api_key_secret': env_key_secret or '',
        }

    config = TwilioConfig.objects.order_by('-updated_at').first()
    if config and config.account_sid and not config.account_sid.startswith('OQ04'):
        return {
            'account_sid': config.account_sid,
            'auth_token': config.auth_token,
            'phone_number': config.phone_number,
            'twiml_app_sid': config.twiml_app_sid,
            'api_key_sid': getattr(config, 'api_key_sid', '') or '',
            'api_key_secret': getattr(config, 'api_key_secret', '') or '',
        }

    file_cfg = load_persistent_config()
    if file_cfg and file_cfg.get('account_sid') and not file_cfg['account_sid'].startswith('OQ04'):
        return file_cfg

    return None


class TwilioConfigView(APIView):
    """
    GET  /api/twilio/config/ - Retrieve current Twilio config (auth token masked)
    POST /api/twilio/config/ - Save/update Twilio config (admin only)
    DELETE /api/twilio/config/ - Reset Twilio config (admin only)
    """

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdmin()]

    def get(self, request):
        config = TwilioConfig.objects.order_by('-updated_at').first()
        eff = get_effective_config()
        if not config and not eff:
            return Response(
                {'detail': 'No Twilio configuration found. Please set up your Twilio credentials.'},
                status=status.HTTP_404_NOT_FOUND,
            )

        is_valid = bool(eff and eff['account_sid'].startswith('AC'))
        has_token = bool(eff and eff.get('auth_token') and len(eff['auth_token']) > 5)

        if config:
            serializer_data = TwilioConfigSerializer(config).data
            serializer_data['is_configured'] = is_valid
            serializer_data['has_auth_token'] = has_token
            return Response(serializer_data)

        return Response({
            'account_sid': eff['account_sid'],
            'phone_number': eff['phone_number'],
            'twiml_app_sid': eff['twiml_app_sid'],
            'api_key_sid': eff.get('api_key_sid', ''),
            'is_configured': is_valid,
            'has_auth_token': has_token,
            'updated_at': None,
        })

    def post(self, request):
        data = request.data.copy()
        raw_account_sid = data.get('account_sid', '').strip()

        # Smart auto-sorting if user pasted SK... or AP... into account_sid
        if raw_account_sid.startswith('SK'):
            data['api_key_sid'] = raw_account_sid
            existing = TwilioConfig.objects.order_by('-updated_at').first()
            if existing and existing.account_sid and existing.account_sid.startswith('AC'):
                data['account_sid'] = existing.account_sid
            else:
                data['account_sid'] = ''

        elif raw_account_sid.startswith('AP'):
            data['twiml_app_sid'] = raw_account_sid
            existing = TwilioConfig.objects.order_by('-updated_at').first()
            if existing and existing.account_sid and existing.account_sid.startswith('AC'):
                data['account_sid'] = existing.account_sid
            else:
                data['account_sid'] = ''

        serializer = TwilioConfigWriteSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        config = TwilioConfig.objects.order_by('-updated_at').first()
        if config:
            for attr, value in serializer.validated_data.items():
                if (attr == 'auth_token' or attr == 'api_key_secret') and not value:
                    continue  # Keep existing secrets if left blank
                if attr == 'account_sid' and not value:
                    continue
                setattr(config, attr, value)
            config.updated_by = request.user
            config.save()
        else:
            config = serializer.save(updated_by=request.user)

        # Auto-provision API Key (SK...) and TwiML App (AP...) if missing
        config = auto_provision_twilio_keys(config)

        # Save to persistent file backup
        save_data = {
            'account_sid': config.account_sid,
            'auth_token': config.auth_token,
            'phone_number': config.phone_number,
            'twiml_app_sid': config.twiml_app_sid,
            'api_key_sid': getattr(config, 'api_key_sid', '') or '',
            'api_key_secret': getattr(config, 'api_key_secret', '') or '',
        }
        save_persistent_config(save_data)

        res_data = TwilioConfigSerializer(config).data
        res_data['is_configured'] = config.account_sid.startswith('AC')
        res_data['has_auth_token'] = bool(config.auth_token and len(config.auth_token) > 5)
        return Response(res_data, status=status.HTTP_200_OK)

    def delete(self, request):
        TwilioConfig.objects.all().delete()
        return Response({'message': 'Twilio configuration reset successfully.'}, status=status.HTTP_200_OK)


class TwilioTestView(APIView):
    """
    GET /api/twilio/test/ - Test connection with Twilio API using current configuration.
    """
    permission_classes = [IsAuthenticated, IsAdmin]

    def get(self, request):
        config = TwilioConfig.objects.order_by('-updated_at').first()
        if config and config.account_sid and config.account_sid.startswith('AC') and config.auth_token:
            config = auto_provision_twilio_keys(config)

        cfg = get_effective_config()
        if not cfg or not cfg['account_sid']:
            return Response(
                {'detail': 'Aucune configuration Twilio active trouvée. Veuillez renseigner votre Account SID (AC...).'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if cfg['account_sid'].startswith('SK'):
            return Response({
                'success': False,
                'message': f'L\'identifiant {cfg["account_sid"][:10]}... est une Clé API (SK...), pas un Account SID. Votre Account SID Twilio se trouve sur la page d\'accueil de votre Console Twilio et commence par AC (ex: AC123456...).'
            }, status=status.HTTP_400_BAD_REQUEST)

        if not cfg['account_sid'].startswith('AC'):
            return Response({
                'success': False,
                'message': f'Account SID invalide ({cfg["account_sid"][:6]}...). Un Account SID Twilio doit obligatoirement commencer par AC.'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            from twilio.rest import Client
            client = Client(cfg['account_sid'], cfg['auth_token'])
            acc = client.api.v2010.accounts(cfg['account_sid']).fetch()
            msg = f'Connecté avec succès à Twilio : {acc.friendly_name} (Statut: {acc.status})'
            if cfg.get('api_key_sid'):
                msg += f' | Clé API SK (Voice SDK) active : {cfg["api_key_sid"][:8]}...'
            return Response({
                'success': True,
                'message': msg
            })
        except Exception as exc:
            return Response({
                'success': False,
                'detail': str(exc),
                'message': f'Erreur d\'authentification Twilio : {str(exc)}'
            }, status=status.HTTP_400_BAD_REQUEST)


class TwilioTokenView(APIView):
    """
    GET /api/twilio/token/
    Generate a Twilio Access Token for the browser Twilio Voice SDK.
    Returns {"token": "...", "identity": "username"}
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        identity = request.user.username
        config = TwilioConfig.objects.order_by('-updated_at').first()

        if config and config.account_sid and config.account_sid.startswith('AC') and config.auth_token:
            if not config.api_key_sid or not config.twiml_app_sid:
                config = auto_provision_twilio_keys(config)

        cfg = get_effective_config()

        if not cfg or not cfg['account_sid'].startswith('AC'):
            logger.warning('Twilio config missing or invalid (must start with AC). Returning simulation token for %s.', identity)
            mock_token = f'mock_token_{identity}_{uuid.uuid4().hex[:16]}'
            return Response({
                'token': mock_token,
                'identity': identity,
                'simulation': True,
                'message': 'Twilio non configuré ou Account SID invalide. Mode simulation actif.',
            })

        try:
            from twilio.jwt.access_token import AccessToken
            from twilio.jwt.access_token.grants import VoiceGrant

            account_sid = cfg['account_sid']
            key_sid = cfg.get('api_key_sid', '')
            key_secret = cfg.get('api_key_secret', '')

            signing_key_sid = key_sid if (key_sid and key_sid.startswith('SK')) else account_sid
            secret_key = key_secret if (key_sid and key_sid.startswith('SK')) else cfg['auth_token']

            token = AccessToken(
                account_sid,
                signing_key_sid,
                secret_key,
                identity=identity,
                ttl=3600,
            )

            voice_grant = VoiceGrant(
                outgoing_application_sid=cfg.get('twiml_app_sid') or None,
                incoming_allow=True,
            )
            token.add_grant(voice_grant)

            return Response({
                'token': token.to_jwt(),
                'identity': identity,
                'simulation': False,
            })

        except Exception as exc:
            logger.error('Failed to generate Twilio token: %s', exc)
            mock_token = f'mock_token_{identity}_{uuid.uuid4().hex[:16]}'
            return Response({
                'token': mock_token,
                'identity': identity,
                'simulation': True,
                'message': f'Génération du jeton Twilio échouée : {str(exc)}. Passage en mode simulation.',
            })
