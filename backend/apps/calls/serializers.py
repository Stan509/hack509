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

    contact_name = serializers.SerializerMethodField()
    phone = serializers.SerializerMethodField()
    first_name = serializers.SerializerMethodField()
    last_name = serializers.SerializerMethodField()
    operator_name = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField(source='timestamp', read_only=True)

    class Meta:
        model = CallLog
        fields = [
            'id', 'contact', 'contact_detail', 'contact_name', 'first_name', 'last_name',
            'phone', 'operator', 'operator_detail', 'operator_name',
            'duration', 'duration_formatted', 'status', 'notes', 'call_sid',
            'timestamp', 'created_at',
        ]
        read_only_fields = ['id', 'timestamp', 'created_at']

    def get_contact_name(self, obj):
        if obj.contact:
            name = f"{obj.contact.first_name} {obj.contact.last_name}".strip()
            return name or obj.contact.phone
        return "Unknown"

    def get_first_name(self, obj):
        return obj.contact.first_name if obj.contact else ""

    def get_last_name(self, obj):
        return obj.contact.last_name if obj.contact else ""

    def get_phone(self, obj):
        return obj.contact.phone if obj.contact else ""

    def get_operator_name(self, obj):
        return obj.operator.username if obj.operator else ""


class CallLogCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a call log entry."""
    phone = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = CallLog
        fields = ['contact', 'phone', 'operator', 'duration', 'status', 'notes', 'call_sid']
        extra_kwargs = {
            'contact': {'required': False},
            'operator': {'required': False},
        }

    def validate_status(self, value):
        valid = [c[0] for c in CallLog.STATUS_CHOICES]
        val = str(value).lower()
        if val in ['active', 'connected', 'answered']:
            return 'answered'
        if val in valid:
            return val
        return 'no_answer'

    def validate(self, attrs):
        if not attrs.get('contact') and attrs.get('phone'):
            phone = attrs.pop('phone')
            from apps.contacts.models import Contact
            from apps.calls.views import clean_e164
            clean_phone = clean_e164(phone)
            contact = Contact.objects.filter(phone=clean_phone).first() or Contact.objects.filter(phone=phone).first()
            if not contact:
                contact = Contact.objects.create(phone=clean_phone or phone, first_name="Appel", last_name="Direct")
            attrs['contact'] = contact
        if not attrs.get('contact'):
            raise serializers.ValidationError({'contact': 'A contact or phone number is required.'})
        return attrs

    def validate_duration(self, value):
        if value < 0:
            raise serializers.ValidationError('Duration cannot be negative.')
        return value


class CallLogUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating call status and notes."""
    class Meta:
        model = CallLog
        fields = ['status', 'notes', 'duration', 'call_sid']
