"""visual_analyzer/serializers.py — DRF serializers for visual analysis I/O."""

from __future__ import annotations

from rest_framework import serializers


class VisualPayloadSerializer(serializers.Serializer[dict[str, object]]):
    """Validates the visual analyzer portion of the analysis request."""

    screenshot_b64 = serializers.CharField()
    dom_metadata = serializers.DictField()
