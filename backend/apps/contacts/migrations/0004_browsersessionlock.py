# Generated manually for BrowserSessionLock
from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('contacts', '0003_browserproxyconfig'),
    ]

    operations = [
        migrations.CreateModel(
            name='BrowserSessionLock',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('session_ticket', models.CharField(blank=True, default='', max_length=64)),
                ('acquired_at', models.DateTimeField(auto_now=True)),
                ('last_heartbeat', models.DateTimeField(auto_now=True)),
                ('active_user', models.ForeignKey(
                    blank=True,
                    null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='browser_locks',
                    to=settings.AUTH_USER_MODEL
                )),
            ],
            options={
                'verbose_name': 'Browser Session Lock',
            },
        ),
    ]
