"""
Contacts admin configuration.
"""
from django.contrib import admin
from .models import Contact


@admin.register(Contact)
class ContactAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'phone', 'status', 'source', 'assigned_to', 'created_at']
    list_filter = ['status', 'source']
    search_fields = ['first_name', 'last_name', 'phone', 'address']
    ordering = ['-created_at']
    list_editable = ['status']
    raw_id_fields = ['assigned_to']
