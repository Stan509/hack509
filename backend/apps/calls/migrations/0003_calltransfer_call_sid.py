from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('calls', '0002_calltransfer'),
    ]

    operations = [
        migrations.AddField(
            model_name='calltransfer',
            name='call_sid',
            field=models.CharField(blank=True, max_length=100),
        ),
    ]
