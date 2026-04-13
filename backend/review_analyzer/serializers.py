"""review_analyzer/serializers.py — DRF serializers for review analysis I/O."""

from __future__ import annotations

from rest_framework import serializers


class ReviewPayloadSerializer(serializers.Serializer[dict[str, object]]):
    """Validates the review portion of the analysis request."""

    review_text = serializers.CharField(allow_null=True, required=False)
