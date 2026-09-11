"""
Twilio Config models - Stores Twilio credentials for the call center.
"""
from django.db import models


class TwilioConfig(models.Model):
    """
    Stores Twilio account configuration for browser SDK calls.
    Only one active configuration should exist at a time.
    """
    account_sid = models.CharField(max_length=100)
    auth_token = models.CharField(
        max_length=200,
        help_text='Twilio Auth Token - stored encrypted in production'
    )
    phone_number = models.CharField(
        max_length=20,
        help_text='Twilio phone number in E.164 format e.g. +15551234567'
    )
    cnam_name = models.CharField(
        max_length=15,
        blank=True,
        help_text='Caller ID Name (CNAM) - max 15 characters'
    )
    twiml_app_sid = models.CharField(
        max_length=100,
        blank=True,
        help_text='TwiML App SID for browser-based calling'
    )
    api_key_sid = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text='Twilio API Key SID starting with SK...'
    )
    api_key_secret = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text='Twilio API Key Secret'
    )
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        'accounts.CustomUser',
        on_delete=models.SET_NULL,
        null=True,
        related_name='twilio_configs'
    )

    class Meta:
        verbose_name = 'Twilio Configuration'
        verbose_name_plural = 'Twilio Configurations'

    def __str__(self):
        return f'Twilio Config ({self.phone_number}) - updated {self.updated_at.strftime("%Y-%m-%d")}'

    def masked_auth_token(self):
        """Return masked auth token for display."""
        if self.auth_token and len(self.auth_token) > 8:
            return self.auth_token[:4] + '****' + self.auth_token[-4:]
        return '********'
