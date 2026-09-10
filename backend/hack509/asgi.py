"""
ASGI config for hack509 project.
"""

import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hack509.settings')
application = get_asgi_application()
