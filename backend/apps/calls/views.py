"""
Calls views - Call log management and statistics.
"""
import logging
from datetime import timedelta
from django.utils import timezone
from django.db.models import Count, Q
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.pagination import PageNumberPagination

from apps.contacts.models import Contact
from apps.accounts.models import CustomUser
from .models import CallLog, CallTransfer
from .serializers import CallLogSerializer, CallLogCreateSerializer, CallLogUpdateSerializer

logger = logging.getLogger(__name__)


class CallLogPagination(PageNumberPagination):
    """Paginate call logs at 50 per page."""
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 500


class CallLogListCreateView(APIView):
    """
    GET  /api/calls/ - List call logs (paginated, with contact info)
    POST /api/calls/ - Create a call log entry
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        queryset = CallLog.objects.all().select_related('contact', 'operator').order_by('-timestamp')

        # Filter by search term
        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(contact__first_name__icontains=search) |
                Q(contact__last_name__icontains=search) |
                Q(contact__phone__icontains=search) |
                Q(notes__icontains=search)
            )

        # Filter by operator
        operator_id = request.query_params.get('operator')
        if operator_id:
            queryset = queryset.filter(operator_id=operator_id)

        # Filter by status
        status_filter = request.query_params.get('status')
        if status_filter:
            queryset = queryset.filter(status=status_filter)

        # Filter by contact
        contact_id = request.query_params.get('contact')
        if contact_id:
            queryset = queryset.filter(contact_id=contact_id)

        # Filter by date (YYYY-MM-DD)
        date_filter = request.query_params.get('date')
        if date_filter:
            queryset = queryset.filter(timestamp__date=date_filter)

        date_from = request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(timestamp__date__gte=date_from)

        date_to = request.query_params.get('date_to')
        if date_to:
            queryset = queryset.filter(timestamp__date__lte=date_to)

        paginator = CallLogPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = CallLogSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    def post(self, request):
        # Auto-assign operator to current user if not provided
        data = request.data.copy()
        if 'operator' not in data:
            data['operator'] = request.user.id

        serializer = CallLogCreateSerializer(data=data)
        if serializer.is_valid():
            call_log = serializer.save()
            # Update the contact's status to match the call outcome
            contact = call_log.contact
            contact.status = call_log.status
            contact.save(update_fields=['status', 'updated_at'])
            return Response(
                CallLogSerializer(call_log).data,
                status=status.HTTP_201_CREATED,
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CallLogDetailView(APIView):
    """
    GET   /api/calls/{id}/        - Get call log detail
    PATCH /api/calls/{id}/status/ - Update call status + notes
    """
    permission_classes = [IsAuthenticated]

    def get_object(self, pk):
        try:
            return CallLog.objects.select_related('contact', 'operator').get(pk=pk)
        except CallLog.DoesNotExist:
            return None

    def get(self, request, pk):
        call = self.get_object(pk)
        if not call:
            return Response({'error': 'Call log not found.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(CallLogSerializer(call).data)

    def patch(self, request, pk):
        call = self.get_object(pk)
        if not call:
            return Response({'error': 'Call log not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = CallLogUpdateSerializer(call, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            # Keep contact status in sync
            if 'status' in request.data:
                call.contact.status = call.status
                call.contact.save(update_fields=['status', 'updated_at'])
            return Response(CallLogSerializer(call).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class CallStatsView(APIView):
    """
    GET /api/calls/stats/
    Returns dashboard statistics:
    {
        total_today, answered_today, connection_rate,
        total_contacts, total_calls
    }
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.now().date()

        total_today = CallLog.objects.filter(timestamp__date=today).count()
        answered_today = CallLog.objects.filter(
            timestamp__date=today,
            status='answered'
        ).count()

        connection_rate = 0.0
        if total_today > 0:
            connection_rate = round((answered_today / total_today) * 100, 2)

        total_contacts = Contact.objects.count()
        total_calls = CallLog.objects.count()

        # Status breakdown for today
        status_breakdown = dict(
            CallLog.objects.filter(timestamp__date=today)
            .values_list('status')
            .annotate(count=Count('id'))
            .values_list('status', 'count')
        )

        return Response({
            'total_today': total_today,
            'answered_today': answered_today,
            'connection_rate': connection_rate,
            'total_contacts': total_contacts,
            'total_calls': total_calls,
            'status_breakdown_today': status_breakdown,
        })


from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.utils.decorators import method_decorator
from apps.twilio_config.models import TwilioConfig
from apps.twilio_config.views import get_effective_config


def clean_e164(num_str):
    """Clean phone number string to E.164 format e.g. +19286688247."""
    if not num_str:
        return ''
    num_str = str(num_str).strip()
    digits = ''.join(c for c in num_str if c.isdigit())
    if not digits:
        return ''
    return '+' + digits


@method_decorator(csrf_exempt, name='dispatch')
class TwimlVoiceView(APIView):
    """
    POST / GET /api/calls/twiml/
    TwiML Webhook endpoint for Twilio Voice SDK outbound calls.
    Returns TwiML XML instructing Twilio to dial the destination phone number.
    """
    permission_classes = []
    authentication_classes = []

    def get(self, request, *args, **kwargs):
        return self.generate_twiml(request)

    def post(self, request, *args, **kwargs):
        return self.generate_twiml(request)

    def generate_twiml(self, request):
        # Extract target phone number from POST or GET parameters sent by Twilio Device SDK
        raw_to = (
            request.POST.get('To') or
            request.POST.get('number') or
            request.POST.get('phone') or
            request.GET.get('To') or
            request.GET.get('number') or
            ''
        ).strip()

        # Check if destination is a Twilio Client / operator username
        if raw_to.startswith('client:') or (not raw_to.startswith('+') and not raw_to.replace('+', '').isdigit() and len(raw_to) > 0 and '@' not in raw_to):
            client_id = raw_to.replace('client:', '').strip()
            logger.info(f"TwiML Voice Webhook: Dialing Twilio Client identity: '{client_id}'")
            twiml = f'''<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial>
        <Client>{client_id}</Client>
    </Dial>
</Response>'''
            return HttpResponse(twiml, content_type='text/xml')

        to_number = clean_e164(raw_to)

        # Retrieve effective Twilio caller ID from config or environment
        cfg = get_effective_config()
        raw_caller_id = cfg.get('phone_number', '') if cfg else ''
        caller_id = clean_e164(raw_caller_id)

        logger.info(f"TwiML Voice Webhook: Outgoing call to '{to_number}' (Caller ID: '{caller_id}')")

        if to_number:
            caller_attr = f' callerId="{caller_id}"' if caller_id else ''
            twiml = f'''<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Dial{caller_attr}>
        <Number>{to_number}</Number>
    </Dial>
</Response>'''
        else:
            twiml = '''<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say language="fr-FR">Aucun numéro de destination spécifié.</Say>
</Response>'''

        return HttpResponse(twiml, content_type='text/xml')


class CallTransferView(APIView):
    """
    POST /api/calls/transfer/
    Initiate in-call operator transfer with database persistence & real-time ringing.
    Supports broadcast transfers to all available operators.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        target_operator_id = request.data.get('target_operator_id')
        target_operator_name = request.data.get('target_operator_name', 'Opérateur')
        phone = request.data.get('phone', '')
        contact_name = request.data.get('contact_name', '')
        contact_id = request.data.get('contact_id')
        is_broadcast = request.data.get('is_broadcast', False) or target_operator_id == 'all'

        target_user = None
        if not is_broadcast and target_operator_id and str(target_operator_id).isdigit():
            try:
                target_user = CustomUser.objects.get(id=int(target_operator_id))
            except CustomUser.DoesNotExist:
                target_user = None

        transfer = CallTransfer.objects.create(
            from_operator=request.user,
            target_operator=target_user,
            phone=phone,
            contact_name=contact_name,
            contact_id=int(contact_id) if (contact_id and str(contact_id).isdigit()) else None,
            is_broadcast=is_broadcast,
            status='pending',
        )

        logger.info(f"Created CallTransfer #{transfer.id} from {request.user.username} to {target_user.username if target_user else 'ALL'} for {phone}")

        msg = "Appel diffusé à tous les opérateurs disponibles." if is_broadcast else f"Transfert d'appel vers {target_operator_name} initié."
        return Response({
            'success': True,
            'transfer_id': transfer.id,
            'message': msg,
            'is_broadcast': is_broadcast,
            'target_operator_id': target_operator_id,
            'target_operator_name': target_operator_name,
            'phone': phone,
            'contact_name': contact_name,
        }, status=status.HTTP_201_CREATED)


class PendingTransfersView(APIView):
    """
    GET /api/calls/transfers/pending/
    Returns active transfers directed to the logged-in operator or broadcasted to all.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cutoff = timezone.now() - timedelta(seconds=60)
        transfers = CallTransfer.objects.filter(
            status='pending',
            created_at__gte=cutoff
        ).exclude(
            from_operator=request.user
        ).filter(
            Q(target_operator=request.user) | Q(target_operator__isnull=True)
        ).select_related('from_operator').order_by('-created_at')

        results = []
        for t in transfers:
            results.append({
                'id': t.id,
                'from_operator_id': t.from_operator.id,
                'from_operator_name': t.from_operator.username or t.from_operator.get_full_name() or 'Opérateur',
                'phone': t.phone,
                'contact_name': t.contact_name,
                'contact_id': t.contact_id,
                'is_broadcast': t.is_broadcast,
                'created_at': t.created_at.isoformat(),
            })

        return Response({'transfers': results}, status=status.HTTP_200_OK)


class AcceptTransferView(APIView):
    """
    POST /api/calls/transfers/<int:pk>/accept/
    Marks a transfer as accepted by the current operator.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            transfer = CallTransfer.objects.get(pk=pk)
        except CallTransfer.DoesNotExist:
            return Response({'error': 'Transfert introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if transfer.status != 'pending':
            return Response({
                'success': False,
                'message': f"Cet appel a déjà été {transfer.status}.",
                'status': transfer.status
            }, status=status.HTTP_400_BAD_REQUEST)

        transfer.status = 'accepted'
        transfer.accepted_by = request.user
        transfer.save(update_fields=['status', 'accepted_by', 'updated_at'])

        logger.info(f"CallTransfer #{transfer.id} accepted by {request.user.username}")

        return Response({
            'success': True,
            'message': 'Transfert accepté avec succès.',
            'transfer_id': transfer.id,
            'phone': transfer.phone,
            'contact_name': transfer.contact_name,
            'contact_id': transfer.contact_id,
        }, status=status.HTTP_200_OK)


class RejectTransferView(APIView):
    """
    POST /api/calls/transfers/<int:pk>/reject/
    Marks a transfer as rejected.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            transfer = CallTransfer.objects.get(pk=pk)
        except CallTransfer.DoesNotExist:
            return Response({'error': 'Transfert introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if not transfer.is_broadcast:
            transfer.status = 'rejected'
            transfer.save(update_fields=['status', 'updated_at'])
            logger.info(f"CallTransfer #{transfer.id} rejected by {request.user.username}")

        return Response({'success': True, 'message': 'Transfert refusé.'}, status=status.HTTP_200_OK)


class TransferStatusView(APIView):
    """
    GET /api/calls/transfers/<int:pk>/status/
    Used by initiator to check if the transferred call was answered/accepted.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        try:
            transfer = CallTransfer.objects.select_related('accepted_by').get(pk=pk)
        except CallTransfer.DoesNotExist:
            return Response({'error': 'Transfert introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        return Response({
            'transfer_id': transfer.id,
            'status': transfer.status,
            'accepted_by': transfer.accepted_by.username if transfer.accepted_by else None,
            'phone': transfer.phone,
            'contact_name': transfer.contact_name,
        }, status=status.HTTP_200_OK)

