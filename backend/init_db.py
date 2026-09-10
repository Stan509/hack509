import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hack509.settings')
django.setup()

from django.core.management import call_command
from apps.accounts.models import CustomUser
from apps.twilio_config.models import TwilioConfig
from apps.contacts.models import Contact

print("Running database migrations...")
call_command('migrate', '--noinput')

# Ensure default admin user
admin_user, created = CustomUser.objects.get_or_create(
    username='admin',
    defaults={'email': 'admin@hacker509.local', 'role': 'admin', 'is_staff': True, 'is_superuser': True}
)
admin_user.set_password('admin123')
admin_user.role = 'admin'
admin_user.is_staff = True
admin_user.is_superuser = True
admin_user.is_active = True
admin_user.save()
print(f"Superuser 'admin' setup complete (created={created})")

# Ensure default operator user
op_user, op_created = CustomUser.objects.get_or_create(
    username='operator',
    defaults={'email': 'operator@hacker509.local', 'role': 'operator', 'is_staff': False, 'is_superuser': False}
)
op_user.set_password('operator123')
op_user.role = 'operator'
op_user.is_active = True
op_user.save()
print(f"Operator user setup complete (created={op_created})")

# Ensure Twilio config exists
tw_cfg, _ = TwilioConfig.objects.get_or_create(
    id=1,
    defaults={
        'account_sid': 'OQ04006c77713a7d32321cf6175bece87c',
        'auth_token': 'kiWo6Uo6_AXSkaeywkutY3w03p_snRn_FgoD_oynqyuJNGvOUBU7KsnoRYpRg-f4l2aTEOqHt3Wb0eVwxfECkA'
    }
)
print(f"TwilioConfig setup complete: {tw_cfg.account_sid}")

# Ensure test contact exists
c, _ = Contact.objects.get_or_create(
    phone='+18295098412',
    defaults={'first_name': 'Test User', 'last_name': 'Dominican Republic', 'notes': 'Test contact', 'is_favorite': True}
)
c.is_favorite = True
c.save()
print("Test contact +18295098412 setup complete")
