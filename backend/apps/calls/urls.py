"""
Calls URL routing.
Mounted at /api/calls/
"""
from django.urls import path
from .views import (
    CallLogListCreateView,
    CallLogDetailView,
    CallStatsView,
    TwimlVoiceView,
    CallTransferView,
    PendingTransfersView,
    AcceptTransferView,
    RejectTransferView,
    TransferStatusView,
)

urlpatterns = [
    path('', CallLogListCreateView.as_view(), name='call-list-create'),
    path('stats/', CallStatsView.as_view(), name='call-stats'),
    path('twiml/', TwimlVoiceView.as_view(), name='call-twiml'),
    path('transfer/', CallTransferView.as_view(), name='call-transfer'),
    path('transfers/pending/', PendingTransfersView.as_view(), name='call-transfers-pending'),
    path('transfers/<int:pk>/accept/', AcceptTransferView.as_view(), name='call-transfer-accept'),
    path('transfers/<int:pk>/reject/', RejectTransferView.as_view(), name='call-transfer-reject'),
    path('transfers/<int:pk>/status/', TransferStatusView.as_view(), name='call-transfer-status'),
    path('<int:pk>/', CallLogDetailView.as_view(), name='call-detail'),
    path('<int:pk>/status/', CallLogDetailView.as_view(), name='call-status-update'),
]
