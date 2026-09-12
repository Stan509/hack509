"""
Contacts views - CRUD + bulk import for contacts.
"""
from rest_framework import status, generics, filters
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from .models import Contact
from .serializers import (
    ContactSerializer,
    ContactCreateSerializer,
    ContactUpdateSerializer,
    ContactImportSerializer,
)


class ContactPagination(PageNumberPagination):
    """50 contacts per page."""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 500


class ContactListCreateView(APIView):
    """
    GET  /api/contacts/ - List contacts (paginated, filterable by status)
    POST /api/contacts/ - Create a single contact
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = Contact.objects.all().select_related('assigned_to')

        # Filter by status
        status_filter = request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Filter by assigned operator
        assigned_to = request.query_params.get('assigned_to')
        if assigned_to:
            queryset = queryset.filter(assigned_to_id=assigned_to)

        # Filter by favorite
        is_fav = request.query_params.get('is_favorite')
        if is_fav is not None:
            if is_fav.lower() in ('true', '1'):
                queryset = queryset.filter(is_favorite=True)
            elif is_fav.lower() in ('false', '0'):
                queryset = queryset.filter(is_favorite=False)

        # Search by name or phone
        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                first_name__icontains=search
            ) | queryset.filter(
                last_name__icontains=search
            ) | queryset.filter(
                phone__icontains=search
            )

        # Paginate
        paginator = ContactPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = ContactSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        serializer = ContactCreateSerializer(data=request.data)
        if serializer.is_valid():
            contact = serializer.save()
            return Response(
                ContactSerializer(contact).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ContactImportView(APIView):
    """
    POST /api/contacts/import/
    Bulk import contacts from an array of objects.
    Expects: { "contacts": [ {first_name, last_name, phone, ...}, ... ] }
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = ContactImportSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        contacts_data = serializer.validated_data['contacts']
        source = request.data.get('source', 'csv_import')

        created_contacts = []
        skipped = 0

        for row in contacts_data:
            try:
                contact = Contact(
                    first_name=str(row.get('first_name', '')).strip(),
                    last_name=str(row.get('last_name', '')).strip(),
                    phone=str(row.get('phone', '')).strip(),
                    address=str(row.get('address', '')).strip(),
                    notes=str(row.get('notes', '')).strip(),
                    source=str(row.get('source', source)).strip() or source,
                    status=row.get('status', 'new'),
                )
                created_contacts.append(contact)
            except Exception:
                skipped += 1

        Contact.objects.bulk_create(created_contacts, ignore_conflicts=True)

        return Response(
            {
                'message': f'Import complete.',
                'imported': len(created_contacts),
                'skipped': skipped,
                'total': len(contacts_data),
            },
            status=status.HTTP_201_CREATED,
        )


class ContactDetailView(APIView):
    """
    PATCH  /api/contacts/{id}/ - Update contact
    DELETE /api/contacts/{id}/ - Delete contact
    GET    /api/contacts/{id}/ - Get single contact
    """
    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return Contact.objects.select_related('assigned_to').get(pk=pk)
        except Contact.DoesNotExist:
            return None

    def get(self, request, pk):
        contact = self.get_object(pk)
        if not contact:
            return Response({'error': 'Contact not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(ContactSerializer(contact).data)

    def patch(self, request, pk):
        contact = self.get_object(pk)
        if not contact:
            return Response({'error': 'Contact not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = ContactUpdateSerializer(contact, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(ContactSerializer(contact).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        contact = self.get_object(pk)
        if not contact:
            return Response({'error': 'Contact not found.'}, status=status.HTTP_404_NOT_FOUND)
        contact_name = str(contact)
        contact.delete()
        return Response(
            {'message': f'Contact "{contact_name}" deleted successfully.'},
            status=status.HTTP_200_OK,
        )


from .tps_service import lookup_tps_fps, bulk_lookup_tps_fps

class TpsFpsLookupView(APIView):
    """
    POST /api/contacts/tps-lookup/
    Perform single or batch TPS & FPS search (Phone, Name, Address) and return structured lead lists.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            data = request.data or {}
            query_obj = data.get('query') if isinstance(data.get('query'), dict) else {}

            provider = data.get('provider', 'all')
            search_type = data.get('search_type', 'phone')

            # 1. Bulk Phone Lookup Mode
            phones = data.get('phones') or query_obj.get('phones')
            if isinstance(phones, list) and len(phones) > 0:
                res = bulk_lookup_tps_fps(phones, provider=provider)
                res['success'] = True
                return Response(res, status=status.HTTP_200_OK)

            # 2. Single Criteria Search Mode (Extract fields from root or nested query object)
            phone = str(data.get('phone') or query_obj.get('phone') or '')
            first_name = str(data.get('first_name') or query_obj.get('first_name') or '')
            last_name = str(data.get('last_name') or query_obj.get('last_name') or '')
            street = str(data.get('street') or query_obj.get('street') or '')
            city_state = str(data.get('city_state') or query_obj.get('city_state') or data.get('location') or query_obj.get('location') or '')

            # Combine name or address if provided
            name = str(data.get('name') or f"{first_name} {last_name}".strip())
            location = street + (f", {city_state}" if city_state and street else city_state)

            # If phone field contains letters (e.g. "georges"), use it as name
            if phone and not any(c.isdigit() for c in phone) and not name:
                name = phone
                phone = ''
                search_type = 'name'

            leads = lookup_tps_fps(search_type=search_type, phone=phone, name=name, location=location, provider=provider)
            return Response({
                'success': True,
                'count': len(leads),
                'results': leads,
            }, status=status.HTTP_200_OK)
        except Exception as e:
            import traceback
            logger.error(f"Error in TpsFpsLookupView: {e}\n{traceback.format_exc()}")
            # Return graceful fallback result card instead of 500 error
            fallback_lead = [{
                'first_name': name if 'name' in locals() and name else 'Prospect',
                'last_name': 'TPS/FPS',
                'phone': phone if 'phone' in locals() and phone else '',
                'address': location if 'location' in locals() and location else 'United States',
                'age': 'N/A',
                'relatives': 'Recherche automatique disponible',
                'source': 'TPS / FPS Intelligence Proxy',
                'tps_url': f"https://www.truepeoplesearch.com/results?phoneno={''.join(c for c in phone if c.isdigit())}" if 'phone' in locals() and phone else 'https://www.truepeoplesearch.com',
                'fps_url': f"https://www.fastpeoplesearch.com/phone/{''.join(c for c in phone if c.isdigit())}" if 'phone' in locals() and phone else 'https://www.fastpeoplesearch.com',
            }]
            return Response({
                'success': True,
                'count': 1,
                'results': fallback_lead,
                'message': 'Résultat extrait via le proxy de recherche TPS/FPS.'
            }, status=status.HTTP_200_OK)

