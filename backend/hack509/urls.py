"""
HACKER509 URL Configuration
Root URL routing for the API.
"""

from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from apps.accounts.views import LoginView, RefreshTokenView

urlpatterns = [
    path('admin/', admin.site.urls),

    # Standard routes (with /api/ prefix)
    path('api/auth/', include('apps.accounts.urls')),
    path('api/token/', LoginView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', RefreshTokenView.as_view(), name='token_refresh'),
    path('api/users/', include('apps.accounts.urls_users')),
    path('api/contacts/', include('apps.contacts.urls')),
    path('api/calls/', include('apps.calls.urls')),
    path('api/twilio/', include('apps.twilio_config.urls')),
    path('api/browser/', include('apps.contacts.urls_browser')),

    # Stripped route fallbacks (for App Platform ingress /api prefix stripping)
    path('auth/', include('apps.accounts.urls')),
    path('token/', LoginView.as_view()),
    path('token/refresh/', RefreshTokenView.as_view()),
    path('users/', include('apps.accounts.urls_users')),
    path('contacts/', include('apps.contacts.urls')),
    path('calls/', include('apps.calls.urls')),
    path('twilio/', include('apps.twilio_config.urls')),
    path('browser/', include('apps.contacts.urls_browser')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

