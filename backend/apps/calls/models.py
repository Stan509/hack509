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
