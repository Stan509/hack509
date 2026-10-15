import os
import sys
import shutil
from pathlib import Path

# Add backend directory to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))

# Ensure SQLite database is copied to /tmp on Vercel serverless environment
if os.environ.get('VERCEL') or os.environ.get('AWS_LAMBDA_FUNCTION_NAME'):
    bundled_db = BASE_DIR / 'db.sqlite3'
    tmp_db = Path('/tmp/db.sqlite3')
    if bundled_db.exists() and not tmp_db.exists():
        try:
            shutil.copyfile(bundled_db, tmp_db)
        except Exception as e:
            print(f"[Vercel] Error copying db.sqlite3: {e}")
    os.environ['SQLITE_DB_PATH'] = str(tmp_db)

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hack509.settings')
os.environ.setdefault('SECRET_KEY', 'hacker509-cyberpunk-secret-key-lh5-leley-hacker-509-change-in-production')
os.environ.setdefault('ALLOWED_HOSTS', '*')

from django.core.wsgi import get_wsgi_application
application = get_wsgi_application()

app = application
