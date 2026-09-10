"""
Contacts serializers.
"""
from rest_framework import serializers
from .models import Contact
from apps.accounts.serializers import UserSerializer


class ContactSerializer(serializers.ModelSerializer):
    """Full contact serializer with assigned user info."""
    assigned_to_detail = UserSerializer(source='assigned_to', read_only=True)
    full_name = serializers.ReadOnlyField()

    class Meta:
        model = Contact
        fields = [
            'id', 'first_name', 'last_name', 'full_name', 'phone',
            'address', 'source', 'status', 'assigned_to', 'assigned_to_detail',
            'notes', 'is_favorite', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'full_name']


class ContactCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating a single contact."""
    class Meta:
        model = Contact
        fields = [
            'first_name', 'last_name', 'phone', 'address',
            'source', 'status', 'assigned_to', 'notes', 'is_favorite',
        ]

    def validate_phone(self, value):
        """Basic phone normalization."""
        return value.strip()


class ContactUpdateSerializer(serializers.ModelSerializer):
    """Serializer for updating contact status and notes."""
    class Meta:
        model = Contact
        fields = [
            'first_name', 'last_name', 'phone', 'address',
            'source', 'status', 'assigned_to', 'notes', 'is_favorite',
        ]


class ContactImportSerializer(serializers.Serializer):
    """Serializer for validating bulk import payload."""
    contacts = serializers.ListField(
        child=serializers.DictField(),
        min_length=1,
        max_length=10000,
        help_text='Array of contact objects to import.'
    )

    def validate_contacts(self, contacts):
        required_fields = {'first_name', 'last_name', 'phone'}
        errors = []
        for i, contact in enumerate(contacts):
            missing = required_fields - set(contact.keys())
            if missing:
                errors.append(f'Row {i + 1}: missing fields {missing}')
        if errors:
            raise serializers.ValidationError(errors)
        return contacts
