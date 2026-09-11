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

def get_effective_config():
    """
    Returns effective Twilio configuration.
    Prefers environment variables, then valid DB record (ignoring dummy OQ04... placeholders).
    """
    env_sid = os.environ.get('TWILIO_ACCOUNT_SID')
    env_token = os.environ.get('TWILIO_AUTH_TOKEN')
    env_phone = os.environ.get('TWILIO_PHONE_NUMBER')
    env_app_sid = os.environ.get('TWILIO_TWIML_APP_SID')

    if env_sid and env_token:
        return {
            'account_sid': env_sid,
            'auth_token': env_token,
            'phone_number': env_phone or '',
            'twiml_app_sid': env_app_sid or '',
        }

    config = TwilioConfig.objects.order_by('-updated_at').first()
    if config and config.account_sid and not config.account_sid.startswith('OQ04'):
        return {
            'account_sid': config.account_sid,
            'auth_token': config.auth_token,
            'phone_number': config.phone_number,
            'twiml_app_sid': config.twiml_app_sid,
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
        
        is_valid = bool(eff and eff['account_sid'].startswith('AC'))
        if config:
            serializer_data = TwilioConfigSerializer(config).data
            serializer_data['is_configured'] = is_valid
            return Response(serializer_data)
        
        return Response({
            'account_sid': eff['account_sid'],
            'phone_number': eff['phone_number'],
            'twiml_app_sid': eff['twiml_app_sid'],
            'is_configured': is_valid,
            'updated_at': None,
        })

    def post(self, request):
        serializer = TwilioConfigWriteSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        config = TwilioConfig.objects.order_by('-updated_at').first()
        if config:
            for attr, value in serializer.validated_data.items():
                if attr == 'auth_token' and not value:
                    continue  # Keep existing auth token if left blank
                setattr(config, attr, value)
            config.updated_by = request.user
            config.save()
        else:
            config = serializer.save(updated_by=request.user)

        res_data = TwilioConfigSerializer(config).data
        res_data['is_configured'] = config.account_sid.startswith('AC')
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
        if not cfg or not cfg['account_sid'] or not cfg['auth_token']:
            return Response(
                {'detail': 'Aucune configuration Twilio active trouvée. Veuillez renseigner un Account SID valide.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not cfg['account_sid'].startswith('AC'):
            return Response({
                'success': False,
                'message': f'Account SID invalide ({cfg["account_sid"][:6]}...). Un Account SID Twilio doit commencer par AC.'
            }, status=status.HTTP_400_BAD_REQUEST)

        try:
            from twilio.rest import Client
            client = Client(cfg['account_sid'], cfg['auth_token'])
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

            twiml_app_sid = cfg.get('twiml_app_sid') or None

            token = AccessToken(
                cfg['account_sid'],
                cfg['account_sid'],  # API key / Account SID
                cfg['auth_token'],   # Secret key
                identity=identity,
                ttl=3600,
            )

            voice_grant = VoiceGrant(
                outgoing_application_sid=twiml_app_sid,
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
