"""
Telephony & Twilio Config models - Stores Twilio & Asterisk SIP credentials for the call center.
"""
from django.db import models


class TwilioConfig(models.Model):
    """
    Stores Telephony account configuration (Twilio SDK or Asterisk WebRTC SIP).
    Only one active configuration should exist at a time.
    """
    PROVIDER_CHOICES = [
        ('twilio', 'Twilio Native SDK'),
        ('asterisk', 'Asterisk / Custom SIP Provider'),
    ]

    provider_type = models.CharField(
        max_length=20,
        choices=PROVIDER_CHOICES,
        default='twilio',
        help_text='Active telephony provider engine'
    )

    # Twilio-specific fields
    account_sid = models.CharField(max_length=100, blank=True, default='')
    auth_token = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text='Twilio Auth Token - stored encrypted in production'
    )
    phone_number = models.CharField(
        max_length=20,
        blank=True,
        default='',
        help_text='Twilio or SIP outbound phone number in E.164 format e.g. +15551234567'
    )
    cnam_name = models.CharField(
        max_length=15,
        blank=True,
        default='',
        help_text='Caller ID Name (CNAM) - max 15 characters'
    )
    twiml_app_sid = models.CharField(
        max_length=100,
        blank=True,
        default='',
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

    # Asterisk / SIP Provider fields (VoIPGate, SipPortal, FreePBX, Twilio Trunking)
    sip_ws_url = models.CharField(
        max_length=255,
        blank=True,
        default='',
        help_text='WebSocket URL e.g. wss://asterisk.example.com:8089/ws'
    )
    sip_username = models.CharField(
        max_length=100,
        blank=True,
        default='',
        help_text='SIP Extension or Username e.g. 1001 or agent1'
    )
    sip_password = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text='SIP Password / Secret'
    )
    sip_domain = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text='SIP Domain / Realm e.g. sip.voipgate.com or asterisk.local'
    )
    sip_outbound_proxy = models.CharField(
        max_length=200,
        blank=True,
        default='',
        help_text='Optional SIP Outbound Proxy'
    )

    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        'accounts.CustomUser',
        on_delete=models.SET_NULL,
        null=True,
        related_name='twilio_configs'
    )

    class Meta:
        verbose_name = 'Telephony Configuration'
        verbose_name_plural = 'Telephony Configurations'

    def __str__(self):
        return f'Telephony Config ({self.provider_type}: {self.phone_number or self.sip_username}) - updated {self.updated_at.strftime("%Y-%m-%d")}'

    def masked_auth_token(self):
        """Return masked auth token for display."""
        if self.auth_token and len(self.auth_token) > 8:
            return self.auth_token[:4] + '****' + self.auth_token[-4:]
        return '********'
