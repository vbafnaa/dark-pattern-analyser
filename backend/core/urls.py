"""core/urls.py — URL routing for the core API."""

from django.urls import path

from core.views import analyze

urlpatterns = [
    path("analyze", analyze, name="analyze"),
]
