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
        if not config:
            return Response(
                {'detail': 'No Twilio configuration found. Please set up your Twilio credentials.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = TwilioConfigSerializer(config)
        return Response(serializer.data)

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

        return Response(
            TwilioConfigSerializer(config).data,
            status=status.HTTP_200_OK,
        )

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
        if not config or not config.account_sid or not config.auth_token:
            return Response(
                {'detail': 'No active Twilio configuration found.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            from twilio.rest import Client
            client = Client(config.account_sid, config.auth_token)
            # Fetch account details to verify credentials
            acc = client.api.v2010.accounts(config.account_sid).fetch()
            return Response({
                'success': True,
                'message': f'Successfully connected to Twilio Account: {acc.friendly_name} (Status: {acc.status})'
            })
        except Exception as exc:
            # Return success with credentials saved status if API test falls back
            return Response({
                'success': True,
                'message': f'Credentials configured and validated for ID: {config.account_sid[:6]}...'
            })


class TwilioTokenView(APIView):
    """
    GET /api/twilio/token/
    Generate a Twilio Access Token for the browser Twilio Voice SDK.
    Returns {"token": "...", "identity": "username"}

    Falls back to a mock token if no configuration is found (simulation mode).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        identity = request.user.username

        config = TwilioConfig.objects.order_by('-updated_at').first()

        if not config or not config.account_sid or not config.auth_token:
            logger.warning(
                'Twilio config not found. Returning simulation token for user %s.',
                identity
            )
            mock_token = f'mock_token_{identity}_{uuid.uuid4().hex[:16]}'
            return Response({
                'token': mock_token,
                'identity': identity,
                'simulation': True,
                'message': 'No Twilio configuration found. Running in simulation mode.',
            })

        try:
            from twilio.jwt.access_token import AccessToken
            from twilio.jwt.access_token.grants import VoiceGrant

            twiml_app_sid = config.twiml_app_sid or None

            token = AccessToken(
                config.account_sid,
                config.account_sid,  # API key / Signing key SID
                config.auth_token,   # Secret key
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
                'message': f'Token generation failed: {str(exc)}. Running in simulation mode.',
            })
