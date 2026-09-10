"""
Twilio Config URL routing.
Mounted at /api/twilio/
"""
from django.urls import path
from .views import TwilioConfigView, TwilioTokenView

urlpatterns = [
    path('config/', TwilioConfigView.as_view(), name='twilio-config'),
    path('token/', TwilioTokenView.as_view(), name='twilio-token'),
]
