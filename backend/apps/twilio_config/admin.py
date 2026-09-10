"""
Twilio Config admin configuration.
"""
from django.contrib import admin
from .models import TwilioConfig


@admin.register(TwilioConfig)
class TwilioConfigAdmin(admin.ModelAdmin):
    list_display = ['phone_number', 'account_sid', 'cnam_name', 'twiml_app_sid', 'updated_by', 'updated_at']
    readonly_fields = ['updated_at']
    raw_id_fields = ['updated_by']

    def save_model(self, request, obj, form, change):
        obj.updated_by = request.user
        super().save_model(request, obj, form, change)
