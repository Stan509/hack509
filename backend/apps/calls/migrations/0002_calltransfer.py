import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('calls', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CallTransfer',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('phone', models.CharField(max_length=50)),
                ('contact_name', models.CharField(blank=True, max_length=200)),
                ('contact_id', models.IntegerField(blank=True, null=True)),
                ('is_broadcast', models.BooleanField(default=False)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('accepted', 'Accepted'), ('rejected', 'Rejected'), ('canceled', 'Canceled')], default='pending', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('accepted_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='accepted_transfers', to=settings.AUTH_USER_MODEL)),
                ('from_operator', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='initiated_transfers', to=settings.AUTH_USER_MODEL)),
                ('target_operator', models.ForeignKey(blank=True, help_text='Null if broadcast to all available operators', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='received_transfers', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Call Transfer',
                'verbose_name_plural': 'Call Transfers',
                'ordering': ['-created_at'],
            },
        ),
    ]
