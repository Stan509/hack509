"""
WSGI config for hack509 project.
"""

import os
from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hack509.settings')
application = get_wsgi_application()
