import os
import json
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hack509.settings')
django.setup()

from django.core.management import call_command
from django.db import connection

print("Checking database schema and running migrations...")

# Defensive schema fix for SQLite if twilio_config_twilioconfig is missing api_key_sid / api_key_secret
try:
    with connection.cursor() as cursor:
        cursor.execute("PRAGMA table_info(twilio_config_twilioconfig)")
        columns = [row[1] for row in cursor.fetchall()]
        if columns:
            if 'api_key_sid' not in columns:
                print("Adding missing column api_key_sid to twilio_config_twilioconfig")
                cursor.execute("ALTER TABLE twilio_config_twilioconfig ADD COLUMN api_key_sid varchar(100) DEFAULT ''")
            if 'api_key_secret' not in columns:
                print("Adding missing column api_key_secret to twilio_config_twilioconfig")
                cursor.execute("ALTER TABLE twilio_config_twilioconfig ADD COLUMN api_key_secret varchar(200) DEFAULT ''")
except Exception as e:
    print(f"Defensive schema check warning: {e}")

try:
    call_command('migrate', '--noinput')
    print("Database migrations applied successfully.")
except Exception as e:
    print(f"Migration error: {e}")

from apps.accounts.models import CustomUser
from apps.twilio_config.models import TwilioConfig
from apps.contacts.models import Contact

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

# Load persistent JSON config if available
json_path = os.path.join(os.path.dirname(__file__), '.twilio_saved_config.json')
account_sid = os.environ.get('TWILIO_ACCOUNT_SID', '')
auth_token = os.environ.get('TWILIO_AUTH_TOKEN', '')
twiml_app_sid = os.environ.get('TWILIO_TWIML_APP_SID', '')
api_key_sid = os.environ.get('TWILIO_API_KEY_SID', '')
api_key_secret = os.environ.get('TWILIO_API_KEY_SECRET', '')
phone_number = '+19286688247'

if os.path.exists(json_path):
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            cfg_data = json.load(f)
            account_sid = cfg_data.get('account_sid', account_sid)
            auth_token = cfg_data.get('auth_token', auth_token)
            phone_number = cfg_data.get('phone_number', phone_number)
            twiml_app_sid = cfg_data.get('twiml_app_sid', twiml_app_sid)
            api_key_sid = cfg_data.get('api_key_sid', api_key_sid)
            api_key_secret = cfg_data.get('api_key_secret', api_key_secret)
            print("Loaded persistent Twilio config from .twilio_saved_config.json")
    except Exception as e:
        print(f"Error loading {json_path}: {e}")

# Ensure Twilio config exists
tw_cfg, _ = TwilioConfig.objects.get_or_create(
    id=1,
    defaults={
        'account_sid': account_sid,
        'auth_token': auth_token,
        'phone_number': phone_number,
        'twiml_app_sid': twiml_app_sid,
        'api_key_sid': api_key_sid,
        'api_key_secret': api_key_secret,
    }
)
if account_sid and not tw_cfg.account_sid:
    tw_cfg.account_sid = account_sid
if auth_token and not tw_cfg.auth_token:
    tw_cfg.auth_token = auth_token
if twiml_app_sid and not tw_cfg.twiml_app_sid:
    tw_cfg.twiml_app_sid = twiml_app_sid
if api_key_sid and not tw_cfg.api_key_sid:
    tw_cfg.api_key_sid = api_key_sid
if api_key_secret and not tw_cfg.api_key_secret:
    tw_cfg.api_key_secret = api_key_secret

tw_cfg.save()
print(f"TwilioConfig setup complete: phone={tw_cfg.phone_number}, api_key_sid={'set' if tw_cfg.api_key_sid else 'empty'}")

# Ensure test contact exists
c, _ = Contact.objects.get_or_create(
    phone='+18295098412',
    defaults={'first_name': 'Test User', 'last_name': 'Dominican Republic', 'notes': 'Test contact', 'is_favorite': True}
)
c.is_favorite = True
c.save()
print("Test contact +18295098412 setup complete")
