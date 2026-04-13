"""dom_analyzer/serializers.py — DRF serializers for DOM analysis I/O."""

from __future__ import annotations

from rest_framework import serializers


class DomPayloadSerializer(serializers.Serializer[dict[str, object]]):
    """Validates the dom_metadata subset of the analysis request."""

    hidden_elements = serializers.ListField(child=serializers.DictField())
    interactive_elements = serializers.ListField(child=serializers.DictField())
    prechecked_inputs = serializers.ListField(child=serializers.DictField())
    url = serializers.URLField()
