"""
Contacts URL routing.
Mounted at /api/contacts/
"""
from django.urls import path
from .views import ContactListCreateView, ContactImportView, ContactDetailView, TpsFpsLookupView

urlpatterns = [
    path('', ContactListCreateView.as_view(), name='contact-list-create'),
    path('import/', ContactImportView.as_view(), name='contact-import'),
    path('tps-lookup/', TpsFpsLookupView.as_view(), name='tps-lookup'),
    path('<int:pk>/', ContactDetailView.as_view(), name='contact-detail'),
]
