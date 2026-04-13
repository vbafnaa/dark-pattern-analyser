"""Tests for the Text Analyzer."""

from __future__ import annotations

import asyncio

import pytest

from core.models import Detection
from text_analyzer.service import TextAnalyzerService


@pytest.fixture
def service() -> TextAnalyzerService:
    return TextAnalyzerService()


def _run(coro: object) -> list[Detection]:
    return asyncio.run(coro)  # type: ignore[arg-type]


class TestTextAnalyzer:
    """Unit tests for TextAnalyzerService."""

    def test_detects_confirmshaming(self, service: TextAnalyzerService) -> None:
        payload = {
            "text_content": {
                "button_labels": [
                    {
                        "selector": "#decline-btn",
                        "text": "No thanks, I don't want to save money",
                    }
                ],
                "headings": [],
                "body_text": "",
            }
        }
        results = _run(service.analyze(payload))
        assert len(results) >= 1
        assert results[0].category == "confirmshaming"

    def test_returns_empty_on_clean_page(self, service: TextAnalyzerService) -> None:
        payload = {
            "text_content": {
                "button_labels": [
                    {"selector": "#ok-btn", "text": "OK"},
                    {"selector": "#cancel-btn", "text": "Cancel"},
                ],
                "headings": [{"selector": "h1", "text": "Welcome"}],
                "body_text": "This is a normal page with no dark patterns.",
            }
        }
        results = _run(service.analyze(payload))
        assert results == []

    def test_confidence_scores_are_bounded(self, service: TextAnalyzerService) -> None:
        payload = {
            "text_content": {
                "button_labels": [
                    {
                        "selector": "#btn",
                        "text": "No, I hate saving money",
                    }
                ],
                "headings": [],
                "body_text": "Only 2 left in stock! Hurry, act now!",
            }
        }
        results = _run(service.analyze(payload))
        for det in results:
            assert 0.0 <= det.confidence <= 1.0
