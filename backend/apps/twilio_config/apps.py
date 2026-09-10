"""
Twilio Config app configuration.
"""
from django.apps import AppConfig


class TwilioConfigConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.twilio_config'
    label = 'twilio_config'
    verbose_name = 'Twilio Configuration'
