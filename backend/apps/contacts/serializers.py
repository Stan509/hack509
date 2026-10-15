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
        validated_list = []
        for i, contact in enumerate(contacts):
            phone = str(contact.get('phone') or contact.get('phone_number') or contact.get('mobile') or contact.get('tel') or '').strip()
            # If phone is not in a dedicated key, scan all keys in contact for digits
            if not phone:
                for k, v in contact.items():
                    val = str(v).strip()
                    digits = ''.join(c for c in val if c.isdigit())
                    if len(digits) in (10, 11) and not any(w in k.lower() for w in ['id', 'date', 'code', 'zip', 'age', 'num_']):
                        phone = val
                        break

            if not phone:
                continue

            # Normalize phone with + prefix
            digits = ''.join(c for c in phone if c.isdigit())
            if len(digits) == 10:
                normalized_phone = '+1' + digits
            elif len(digits) == 11 and digits.startswith('1'):
                normalized_phone = '+' + digits
            elif phone.startswith('+'):
                normalized_phone = '+' + digits
            else:
                normalized_phone = '+' + digits if digits else phone

            # Detect names. A single "Name"/"full_name" column is kept whole as the
            # contact's full name (the former first/last split appended a placeholder
            # 'CSV' last name, which prevented the CSV "Name" from showing verbatim).
            fname = str(contact.get('first_name') or contact.get('firstname') or contact.get('prenom') or '').strip()
            lname = str(contact.get('last_name') or contact.get('lastname') or contact.get('nom') or '').strip()
            full_name = str(contact.get('name') or contact.get('full_name') or contact.get('fullname') or contact.get('nom_complet') or contact.get('client') or '').strip()

            if not fname and not lname:
                # Single "Name" column -> keep the whole value as the contact name
                fname = full_name or 'Prospect'
                lname = ''

            if not fname:
                fname = 'Prospect'

            address = str(contact.get('address') or contact.get('addr') or contact.get('street') or contact.get('adresse') or '').strip()
            city = str(contact.get('city') or contact.get('ville') or '').strip()
            state = str(contact.get('state') or contact.get('etat') or contact.get('region') or '').strip()
            if city or state:
                loc_part = f"{city}, {state}".strip(' ,')
                address = f"{address} ({loc_part})".strip() if address else loc_part

            notes = str(contact.get('notes') or contact.get('note') or contact.get('remarque') or contact.get('company') or '').strip()
            source = str(contact.get('source') or 'csv_import').strip()
            status_val = str(contact.get('status') or 'new').strip()

            validated_list.append({
                'first_name': fname,
                'last_name': lname,
                'phone': normalized_phone,
                'address': address,
                'notes': notes,
                'source': source,
                'status': status_val,
            })

        if not validated_list:
            raise serializers.ValidationError("Aucun contact valide avec un numéro de téléphone n'a été trouvé dans le fichier CSV.")

        return validated_list
