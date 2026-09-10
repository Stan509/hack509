"""
Accounts auth URL routing.
Mounted at /api/auth/
"""
from django.urls import path
from .views import LoginView, RefreshTokenView, RegisterView, MeView

urlpatterns = [
    path('login/', LoginView.as_view(), name='auth-login'),
    path('refresh/', RefreshTokenView.as_view(), name='auth-refresh'),
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('me/', MeView.as_view(), name='auth-me'),
]
