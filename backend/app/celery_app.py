from celery import Celery

from app.config import settings

celery_app = Celery(
    "sih_platform",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.tasks.generate"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)
