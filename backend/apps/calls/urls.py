"""
Calls URL routing.
Mounted at /api/calls/
"""
from django.urls import path
from .views import CallLogListCreateView, CallLogDetailView, CallStatsView

urlpatterns = [
    path('', CallLogListCreateView.as_view(), name='call-list-create'),
    path('stats/', CallStatsView.as_view(), name='call-stats'),
    path('<int:pk>/', CallLogDetailView.as_view(), name='call-detail'),
    path('<int:pk>/status/', CallLogDetailView.as_view(), name='call-status-update'),
]
