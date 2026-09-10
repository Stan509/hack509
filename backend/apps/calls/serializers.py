"""
Calls serializers.
"""
from rest_framework import serializers
from .models import CallLog
from apps.accounts.serializers import UserSerializer
from apps.contacts.serializers import ContactSerializer


class CallLogSerializer(serializers.ModelSerializer):
    """Full call log serializer with nested contact and operator info."""
    contact_detail = ContactSerializer(source='contact', read_only=True)
    operator_detail = UserSerializer(source='operator', read_only=True)
    duration_formatted = serializers.ReadOnlyField()

    class Meta:
        model = CallLog
        fields = [
            'id', 'contact', 'contact_detail', 'operator', 'operator_detail',
            'duration', 'duration_formatted', 'status', 'notes', 'call_sid', 'timestamp',
        ]
        read_only_fields = ['id', 'timestamp']


class CallLogCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a call log entry."""
    class Meta:
        model = CallLog
        fields = ['contact', 'operator', 'duration', 'status', 'notes', 'call_sid']

    def validate_duration(self, value):
        if value < 0:
            raise serializers.ValidationError('Duration cannot be negative.')
        return value


class CallLogUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating call status and notes."""
    class Meta:
        model = CallLog
        fields = ['status', 'notes', 'duration', 'call_sid']
