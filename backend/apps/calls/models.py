"""
Calls models - Call log tracking for the call center.
"""
from django.db import models


class CallLog(models.Model):
    """
    Records every call attempt made by an operator.
    Links to Contact and the operator who made the call.
    """
    STATUS_CHOICES = [
        ('answered', 'Answered'),
        ('busy', 'Busy'),
        ('voicemail', 'Voicemail'),
        ('wrong_number', 'Wrong Number'),
        ('do_not_call', 'Do Not Call'),
        ('no_answer', 'No Answer'),
    ]

    contact = models.ForeignKey(
        'contacts.Contact',
        on_delete=models.CASCADE,
        related_name='call_logs'
    )
    operator = models.ForeignKey(
        'accounts.CustomUser',
        on_delete=models.CASCADE,
        related_name='call_logs'
    )
    duration = models.IntegerField(
        default=0,
        help_text='Call duration in seconds'
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    notes = models.TextField(blank=True)
    call_sid = models.CharField(
        max_length=100,
        blank=True,
        help_text='Twilio Call SID for reference'
    )
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = 'Call Log'
        verbose_name_plural = 'Call Logs'
        ordering = ['-timestamp']

    def __str__(self):
        return f'Call to {self.contact} by {self.operator} [{self.status}]'

    @property
    def duration_formatted(self):
        """Return duration as MM:SS string."""
        minutes = self.duration // 60
        seconds = self.duration % 60
        return f'{minutes:02d}:{seconds:02d}'


class CallTransfer(models.Model):
    """
    Tracks in-progress and completed call transfers between operators.
    """
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('accepted', 'Accepted'),
        ('rejected', 'Rejected'),
        ('canceled', 'Canceled'),
    ]

    from_operator = models.ForeignKey(
        'accounts.CustomUser',
        on_delete=models.CASCADE,
        related_name='initiated_transfers'
    )
    target_operator = models.ForeignKey(
        'accounts.CustomUser',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='received_transfers',
        help_text='Null if broadcast to all available operators'
    )
    phone = models.CharField(max_length=50)
    contact_name = models.CharField(max_length=200, blank=True)
    contact_id = models.IntegerField(null=True, blank=True)
    is_broadcast = models.BooleanField(default=False)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    accepted_by = models.ForeignKey(
        'accounts.CustomUser',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='accepted_transfers'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Call Transfer'
        verbose_name_plural = 'Call Transfers'
        ordering = ['-created_at']

    def __str__(self):
        target = self.target_operator.username if self.target_operator else 'BROADCAST'
        return f"Transfer from {self.from_operator.username} to {target} ({self.phone}) [{self.status}]"

