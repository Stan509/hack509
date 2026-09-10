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

    class Meta:
        model = TwilioConfig
        fields = [
            'id', 'account_sid', 'auth_token_masked', 'phone_number',
            'cnam_name', 'twiml_app_sid', 'updated_at', 'updated_by',
        ]
        read_only_fields = ['id', 'updated_at', 'updated_by']

    def get_auth_token_masked(self, obj):
        return obj.masked_auth_token()


class TwilioConfigWriteSerializer(serializers.ModelSerializer):
    """
    Serializer for creating/updating TwilioConfig - accepts real auth token.
    """
    class Meta:
        model = TwilioConfig
        fields = [
            'account_sid', 'auth_token', 'phone_number',
            'cnam_name', 'twiml_app_sid',
        ]

    def validate_phone_number(self, value):
        """Ensure phone number is in E.164 format."""
        value = value.strip()
        if not value.startswith('+'):
            raise serializers.ValidationError(
                'Phone number must be in E.164 format (e.g. +15551234567).'
            )
        return value

    def validate_account_sid(self, value):
        value = value.strip()
        if not value.startswith('AC'):
            raise serializers.ValidationError(
                'Account SID must start with "AC".'
            )
        return value
