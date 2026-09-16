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


class BrowserProxyConfig(models.Model):
    """
    Configuration for Remote Chromium Proxy (Decodo or custom HTTP/SOCKS5).
    Allows toggling between natural server IP and residential US proxy.
    """
    enabled = models.BooleanField(default=False)
    provider = models.CharField(max_length=50, default='Decodo')
    protocol = models.CharField(max_length=20, default='http')
    host = models.CharField(max_length=255, blank=True, default='gate.decodo.com')
    port = models.IntegerField(default=7000)
    username = models.CharField(max_length=255, blank=True, default='')
    password = models.CharField(max_length=255, blank=True, default='')
    country = models.CharField(max_length=10, default='US')
    session_type = models.CharField(max_length=20, default='sticky')  # sticky or rotating
    session_duration = models.IntegerField(default=30)  # minutes
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Browser Proxy Configuration'
        verbose_name_plural = 'Browser Proxy Configurations'

    def __str__(self):
        status = 'ACTIVE' if self.enabled else 'DISABLED'
        return f"Browser Proxy ({self.provider} - {status})"

    def masked_password(self):
        if self.password:
            return '********'
        return ''


class BrowserSessionLock(models.Model):
    """
    Exclusive session lock to prevent multi-operator collisions and eavesdropping
    on the shared remote Chromium instance.
    """
    active_user = models.ForeignKey(
        'accounts.CustomUser',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='browser_locks'
    )
    session_ticket = models.CharField(max_length=64, blank=True, default='')
    acquired_at = models.DateTimeField(auto_now=True)
    last_heartbeat = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Browser Session Lock'

    def is_locked_by_other(self, user):
        from django.utils import timezone
        import datetime
        if not self.active_user:
            return False
        if user and self.active_user_id == user.id:
            return False
        # If last heartbeat is older than 45 seconds, consider lock expired
        if timezone.now() - self.last_heartbeat > datetime.timedelta(seconds=45):
            return False
        return True

