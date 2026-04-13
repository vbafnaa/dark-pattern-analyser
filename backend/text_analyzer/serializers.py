"""text_analyzer/serializers.py — DRF serializers for text analysis I/O."""

from __future__ import annotations

from rest_framework import serializers


class LabeledElementSerializer(serializers.Serializer[dict[str, str]]):
    selector = serializers.CharField()
    text = serializers.CharField()


class TextPayloadSerializer(serializers.Serializer[dict[str, object]]):
    """Validates the text_content subset of the analysis request."""

    button_labels = LabeledElementSerializer(many=True)
    headings = LabeledElementSerializer(many=True)
    body_text = serializers.CharField(allow_blank=True)
