"""
core/views.py — POST /api/analyze endpoint.

Accepts the full analysis payload, dispatches to all analyzers,
and returns merged detections.
"""

from __future__ import annotations

import asyncio
from dataclasses import asdict

from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.request import Request
from rest_framework.response import Response

from core.dispatcher import dispatch
from core.serializers import AnalyzeRequestSerializer, AnalyzeResponseSerializer

# Lazy-import analyzer services to avoid circular imports
_analyzers: dict[str, object] | None = None


def _get_analyzers() -> dict[str, object]:
    global _analyzers  # noqa: PLW0603
    if _analyzers is None:
        from dom_analyzer.service import DomAnalyzerService
        from text_analyzer.service import TextAnalyzerService
        from visual_analyzer.service import VisualAnalyzerService
        from review_analyzer.service import ReviewAnalyzerService

        _analyzers = {
            "dom": DomAnalyzerService(),
            "text": TextAnalyzerService(),
            "visual": VisualAnalyzerService(),
            "review": ReviewAnalyzerService(),
        }
    return _analyzers  # type: ignore[return-value]


@api_view(["POST"])
def analyze(request: Request) -> Response:
    """POST /api/analyze — run all dark-pattern analyzers."""
    serializer = AnalyzeRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    payload: dict[str, object] = serializer.validated_data  # type: ignore[assignment]
    analyzers = _get_analyzers()

    # Run async dispatcher from sync Django view
    detections = asyncio.run(dispatch(analyzers, payload))  # type: ignore[arg-type]

    response_data = {
        "detections": [asdict(d) for d in detections],
    }

    out = AnalyzeResponseSerializer(data=response_data)
    out.is_valid(raise_exception=True)

    return Response(out.validated_data, status=status.HTTP_200_OK)
