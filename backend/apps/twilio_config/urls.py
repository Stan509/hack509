"""
Twilio Config URL routing.
Mounted at /api/twilio/
"""
from django.urls import path
from .views import TwilioConfigView, TwilioTokenView, TwilioTestView

urlpatterns = [
    path('config/', TwilioConfigView.as_view(), name='twilio-config'),
    path('token/', TwilioTokenView.as_view(), name='twilio-token'),
    path('test/', TwilioTestView.as_view(), name='twilio-test'),
]
