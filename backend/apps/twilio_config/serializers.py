"""
Telephony & Twilio Config serializers.
"""
from rest_framework import serializers
from .models import TwilioConfig


class TwilioConfigSerializer(serializers.ModelSerializer):
    """
    Serializer for reading TelephonyConfig - masks secrets.
    """
    auth_token_masked = serializers.SerializerMethodField()
    sip_password_masked = serializers.SerializerMethodField()
    is_configured = serializers.SerializerMethodField()

    class Meta:
        model = TwilioConfig
        fields = [
            'id', 'provider_type', 'account_sid', 'auth_token_masked', 'phone_number',
            'cnam_name', 'twiml_app_sid', 'api_key_sid',
            'sip_ws_url', 'sip_username', 'sip_password_masked', 'sip_domain', 'sip_outbound_proxy',
            'is_configured', 'updated_at', 'updated_by',
        ]
        read_only_fields = ['id', 'updated_at', 'updated_by']

    def get_auth_token_masked(self, obj):
        return obj.masked_auth_token()

    def get_sip_password_masked(self, obj):
        if obj.sip_password and len(obj.sip_password) > 4:
            return obj.sip_password[:2] + '****' + obj.sip_password[-2:]
        return '********'

    def get_is_configured(self, obj):
        if not obj:
            return False
        if obj.provider_type == 'asterisk':
            return bool(obj.sip_ws_url and obj.sip_username)
        return bool(obj.account_sid and obj.auth_token)


class TwilioConfigWriteSerializer(serializers.ModelSerializer):
    """
    Serializer for creating/updating TelephonyConfig - accepts secrets.
    """
    provider_type = serializers.CharField(required=False, default='twilio')
    account_sid = serializers.CharField(required=False, allow_blank=True, default='')
    auth_token = serializers.CharField(required=False, allow_blank=True, default='')
    phone_number = serializers.CharField(required=False, allow_blank=True, default='')
    api_key_sid = serializers.CharField(required=False, allow_blank=True, default='')
    api_key_secret = serializers.CharField(required=False, allow_blank=True, default='')

    sip_ws_url = serializers.CharField(required=False, allow_blank=True, default='')
    sip_username = serializers.CharField(required=False, allow_blank=True, default='')
    sip_password = serializers.CharField(required=False, allow_blank=True, default='')
    sip_domain = serializers.CharField(required=False, allow_blank=True, default='')
    sip_outbound_proxy = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = TwilioConfig
        fields = [
            'provider_type', 'account_sid', 'auth_token', 'phone_number',
            'cnam_name', 'twiml_app_sid', 'api_key_sid', 'api_key_secret',
            'sip_ws_url', 'sip_username', 'sip_password', 'sip_domain', 'sip_outbound_proxy',
        ]

    def validate_phone_number(self, value):
        if not value:
            return ''
        value = value.strip()
        if value and not value.startswith('+'):
            return '+' + value
        return value
