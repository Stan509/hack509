"""
Twilio Config views - Configuration management and Access Token generation.
"""
import uuid
import logging

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import IsAdmin
from .models import TwilioConfig
from .serializers import TwilioConfigSerializer, TwilioConfigWriteSerializer

logger = logging.getLogger(__name__)


import os
import json
from django.conf import settings

CONFIG_FILE = os.path.join(settings.BASE_DIR, 'twilio_saved_config.json')

def load_persistent_config():
    try:
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        logger.warning(f"Could not load persistent config file: {e}")
    return {}

def save_persistent_config(data):
    try:
        current = load_persistent_config()
        for k, v in data.items():
            if v:  # Only overwrite non-empty fields
                current[k] = str(v).strip()
        with open(CONFIG_FILE, 'w') as f:
            json.dump(current, f)
    except Exception as e:
        logger.warning(f"Could not save persistent config file: {e}")


def get_effective_config():
    """
    Returns effective Twilio configuration.
    Prefers environment variables, persistent json backup, then valid DB record.
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
    file_cfg = load_persistent_config()

    account_sid = (config.account_sid if config and not config.account_sid.startswith('OQ04') else '') or file_cfg.get('account_sid', '')
    auth_token = (config.auth_token if config and config.auth_token and not config.auth_token.startswith('kiWo') else '') or file_cfg.get('auth_token', '')
    phone_number = (config.phone_number if config else '') or file_cfg.get('phone_number', '')
    twiml_app_sid = (config.twiml_app_sid if config else '') or file_cfg.get('twiml_app_sid', '')
    api_key_sid = (getattr(config, 'api_key_sid', '') if config else '') or file_cfg.get('api_key_sid', '')
    api_key_secret = (getattr(config, 'api_key_secret', '') if config else '') or file_cfg.get('api_key_secret', '')

    if account_sid and not account_sid.startswith('OQ04'):
        return {
            'account_sid': account_sid,
            'auth_token': auth_token,
            'phone_number': phone_number,
            'twiml_app_sid': twiml_app_sid,
            'api_key_sid': api_key_sid,
            'api_key_secret': api_key_secret,
        }

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
        
        is_valid = bool(eff and eff['account_sid'].startswith('AC') and eff['auth_token'])
        auth_token_masked = ''
        has_auth_token = False
        if eff and eff.get('auth_token'):
            has_auth_token = True
            tok = eff['auth_token']
            auth_token_masked = tok[:4] + '****' + tok[-4:] if len(tok) > 8 else '••••••••••••••••'

        if config:
            serializer_data = TwilioConfigSerializer(config).data
            serializer_data['is_configured'] = is_valid
            serializer_data['has_auth_token'] = has_auth_token
            serializer_data['auth_token_masked'] = auth_token_masked
            return Response(serializer_data)
        
        return Response({
            'account_sid': eff['account_sid'] if eff else '',
            'phone_number': eff['phone_number'] if eff else '',
            'twiml_app_sid': eff['twiml_app_sid'] if eff else '',
            'api_key_sid': eff['api_key_sid'] if eff else '',
            'is_configured': is_valid,
            'has_auth_token': has_auth_token,
            'auth_token_masked': auth_token_masked,
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

        # Save to persistent file backup as well
        save_persistent_config(serializer.validated_data)

        res_data = TwilioConfigSerializer(config).data
        res_data['is_configured'] = config.account_sid.startswith('AC') and bool(config.auth_token)
        res_data['has_auth_token'] = bool(config.auth_token)
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
            auth_val = cfg['api_key_secret'] if (cfg['api_key_sid'] and cfg['api_key_secret']) else cfg['auth_token']
            client = Client(cfg['account_sid'], auth_val)
            # Fetch account details to verify credentials
            acc = client.api.v2010.accounts(cfg['account_sid']).fetch()
            return Response({
                'success': True,
                'message': f'Connecté avec succès à Twilio : {acc.friendly_name} (Statut: {acc.status})'
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

            # Twilio AccessToken requires an API Key SID (starting with SK) and secret for browser Voice SDK.
            # If SK... is available, use it for signing; otherwise use account_sid and auth_token as fallback.
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
