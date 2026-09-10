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
    path('api/auth/', include('apps.accounts.urls')),
    path('api/token/', LoginView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', RefreshTokenView.as_view(), name='token_refresh'),
    path('api/users/', include('apps.accounts.urls_users')),
    path('api/contacts/', include('apps.contacts.urls')),
    path('api/calls/', include('apps.calls.urls')),
    path('api/twilio/', include('apps.twilio_config.urls')),
] + static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)

