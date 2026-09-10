"""
Twilio Config serializers.
"""
from rest_framework import serializers
from .models import TwilioConfig


class TwilioConfigSerializer(serializers.ModelSerializer):
    """
    Serializer for reading TwilioConfig - masks the auth token.
    """
    auth_token_masked = serializers.SerializerMethodField()
    is_configured = serializers.SerializerMethodField()

    class Meta:
        model = TwilioConfig
        fields = [
            'id', 'account_sid', 'auth_token_masked', 'phone_number',
            'cnam_name', 'twiml_app_sid', 'is_configured', 'updated_at', 'updated_by',
        ]
        read_only_fields = ['id', 'updated_at', 'updated_by']

    def get_auth_token_masked(self, obj):
        return obj.masked_auth_token()

    def get_is_configured(self, obj):
        return bool(obj and obj.account_sid and obj.auth_token)


class TwilioConfigWriteSerializer(serializers.ModelSerializer):
    """
    Serializer for creating/updating TwilioConfig - accepts real auth token.
    """
    auth_token = serializers.CharField(required=False, allow_blank=True, default='')
    phone_number = serializers.CharField(required=False, allow_blank=True, default='')

    class Meta:
        model = TwilioConfig
        fields = [
            'account_sid', 'auth_token', 'phone_number',
            'cnam_name', 'twiml_app_sid',
        ]

    def validate_phone_number(self, value):
        """Ensure phone number is formatted if provided."""
        if not value:
            return ''
        value = value.strip()
        if value and not value.startswith('+'):
            return '+' + value
        return value

    def validate_account_sid(self, value):
        value = value.strip()
        if len(value) < 6:
            raise serializers.ValidationError(
                'Account SID or Client ID must be a valid Twilio ID.'
            )
        return value
