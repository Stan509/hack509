"""
Browser endpoints routing.
Mounted at /api/browser/
"""
from django.urls import path
from .views_browser import (
    BrowserSessionView,
    BrowserSessionHeartbeatView,
    BrowserActionView,
    BrowserCaptureView,
    BrowserProxyConfigView,
    BrowserProxyTestView,
    BrowserChromiumIpView,
    BrowserAuthCheckView,
)

urlpatterns = [
    path('session/', BrowserSessionView.as_view(), name='browser-session'),
    path('session/heartbeat/', BrowserSessionHeartbeatView.as_view(), name='browser-session-heartbeat'),
    path('action/', BrowserActionView.as_view(), name='browser-action'),
    path('capture/', BrowserCaptureView.as_view(), name='browser-capture'),
    path('proxy/', BrowserProxyConfigView.as_view(), name='browser-proxy-config'),
    path('proxy/test/', BrowserProxyTestView.as_view(), name='browser-proxy-test'),
    path('proxy/chromium-ip/', BrowserChromiumIpView.as_view(), name='browser-chromium-ip'),
    path('auth-check/', BrowserAuthCheckView.as_view(), name='browser-auth-check'),
]

