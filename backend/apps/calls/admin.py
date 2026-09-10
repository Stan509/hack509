"""
Calls admin configuration.
"""
from django.contrib import admin
from .models import CallLog


@admin.register(CallLog)
class CallLogAdmin(admin.ModelAdmin):
    list_display = ['contact', 'operator', 'status', 'duration_formatted', 'call_sid', 'timestamp']
    list_filter = ['status', 'timestamp']
    search_fields = ['contact__first_name', 'contact__last_name', 'contact__phone', 'call_sid']
    ordering = ['-timestamp']
    raw_id_fields = ['contact', 'operator']
    readonly_fields = ['timestamp', 'duration_formatted']
