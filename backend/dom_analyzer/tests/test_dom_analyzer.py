"""Tests for the DOM Analyzer."""

from __future__ import annotations

import asyncio

import pytest

from core.models import Detection
from dom_analyzer.service import DomAnalyzerService


@pytest.fixture
def service() -> DomAnalyzerService:
    return DomAnalyzerService()


def _run(coro: object) -> list[Detection]:
    return asyncio.run(coro)  # type: ignore[arg-type]


class TestDomAnalyzer:
    """Unit tests for DomAnalyzerService."""

    def test_detects_prechecked_inputs(self, service: DomAnalyzerService) -> None:
        payload = {
            "dom_metadata": {
                "hidden_elements": [],
                "interactive_elements": [],
                "prechecked_inputs": [
                    {
                        "selector": "#newsletter-optin",
                        "tag_name": "input",
                        "text_content": "",
                        "attributes": {"type": "checkbox", "checked": ""},
                        "bounding_rect": {"x": 0, "y": 0, "width": 20, "height": 20},
                        "computed_styles": {
                            "color": "black",
                            "background_color": "white",
                            "font_size": "14px",
                            "opacity": "1",
                            "display": "inline",
                            "visibility": "visible",
                        },
                    }
                ],
                "url": "https://example.com",
            }
        }
        results = _run(service.analyze(payload))
        assert len(results) >= 1
        assert results[0].category == "preselection"

    def test_returns_empty_on_clean_page(self, service: DomAnalyzerService) -> None:
        payload = {
            "dom_metadata": {
                "hidden_elements": [],
                "interactive_elements": [],
                "prechecked_inputs": [],
                "url": "https://example.com",
            }
        }
        results = _run(service.analyze(payload))
        assert results == []

    def test_confidence_scores_are_bounded(self, service: DomAnalyzerService) -> None:
        payload = {
            "dom_metadata": {
                "hidden_elements": [],
                "interactive_elements": [],
                "prechecked_inputs": [
                    {
                        "selector": "#opt",
                        "tag_name": "input",
                        "text_content": "",
                        "attributes": {"type": "checkbox"},
                        "bounding_rect": {"x": 0, "y": 0, "width": 20, "height": 20},
                        "computed_styles": {
                            "color": "black",
                            "background_color": "white",
                            "font_size": "14px",
                            "opacity": "1",
                            "display": "inline",
                            "visibility": "visible",
                        },
                    }
                ],
                "url": "https://example.com",
            }
        }
        results = _run(service.analyze(payload))
        for det in results:
            assert 0.0 <= det.confidence <= 1.0
