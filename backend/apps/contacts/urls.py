"""
Contacts URL routing.
Mounted at /api/contacts/
"""
from django.urls import path
from .views import ContactListCreateView, ContactImportView, ContactDetailView

urlpatterns = [
    path('', ContactListCreateView.as_view(), name='contact-list-create'),
    path('import/', ContactImportView.as_view(), name='contact-import'),
    path('<int:pk>/', ContactDetailView.as_view(), name='contact-detail'),
]
