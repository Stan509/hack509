"""
Contacts models - Contact management for the call center.
"""
from django.db import models


class Contact(models.Model):
    """
    Represents a call center contact/lead.
    Tracks call status and assignment to operators.
    """
    STATUS_CHOICES = [
        ('new', 'New'),
        ('answered', 'Answered'),
        ('busy', 'Busy'),
        ('voicemail', 'Voicemail'),
        ('wrong_number', 'Wrong Number'),
        ('do_not_call', 'Do Not Call'),
        ('pending', 'Pending'),
    ]

    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    phone = models.CharField(max_length=20)
    address = models.TextField(blank=True)
    source = models.CharField(
        max_length=100,
        default='manual',
        help_text='Origin of this contact (e.g. csv_import, manual, crm_sync)'
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='new'
    )
    assigned_to = models.ForeignKey(
        'accounts.CustomUser',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='assigned_contacts'
    )
    notes = models.TextField(blank=True)
    is_favorite = models.BooleanField(default=False, help_text='Marked as favorite contact')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Contact'
        verbose_name_plural = 'Contacts'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.first_name} {self.last_name} ({self.phone})'

    @property
    def full_name(self):
        return f'{self.first_name} {self.last_name}'.strip()
