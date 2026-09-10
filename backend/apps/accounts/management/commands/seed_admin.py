"""
Management command: seed_admin
Creates the default admin user for HACKER509 if it does not already exist.

Usage:
    python manage.py seed_admin
"""
from django.core.management.base import BaseCommand
from apps.accounts.models import CustomUser


class Command(BaseCommand):
    help = 'Creates default admin user (username=admin, password=hacker509) if not exists.'

    def handle(self, *args, **options):
        username = 'admin'
        password = 'hacker509'
        email = 'admin@hacker509.local'

        if CustomUser.objects.filter(username=username).exists():
            self.stdout.write(
                self.style.WARNING(
                    f'Admin user "{username}" already exists. Skipping creation.'
                )
            )
            return

        user = CustomUser.objects.create_superuser(
            username=username,
            email=email,
            password=password,
        )
        user.role = 'admin'
        user.first_name = 'HACKER509'
        user.last_name = 'Admin'
        user.save()

        self.stdout.write(
            self.style.SUCCESS(
                f'[OK] Admin user created successfully!\n'
                f'   Username : {username}\n'
                f'   Password : {password}\n'
                f'   Role     : admin\n'
                f'   Email    : {email}\n'
                f'   [!] Change the password in production!'
            )
        )
