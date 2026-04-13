"""Tests for the Visual Analyzer."""

from __future__ import annotations

import asyncio

import pytest

from core.models import Detection
from visual_analyzer.element_map_builder import build_element_map
from visual_analyzer.service import VisualAnalyzerService


@pytest.fixture
def service() -> VisualAnalyzerService:
    return VisualAnalyzerService()


def _run(coro: object) -> list[Detection]:
    return asyncio.run(coro)  # type: ignore[arg-type]


class TestElementMapBuilder:
    """Unit tests for element_map_builder."""

    def test_builds_element_map_from_dom(self) -> None:
        dom_metadata = {
            "interactive_elements": [
                {
                    "selector": "#accept",
                    "tag_name": "button",
                    "text_content": "Accept All",
                    "attributes": {},
                    "bounding_rect": {"x": 100, "y": 200, "width": 200, "height": 50},
                    "computed_styles": {
                        "color": "white",
                        "background_color": "green",
                        "font_size": "16px",
                        "opacity": "1",
                        "display": "block",
                        "visibility": "visible",
                    },
                }
            ],
            "hidden_elements": [],
            "prechecked_inputs": [],
            "url": "https://example.com",
        }
        emap = build_element_map(dom_metadata)
        assert len(emap.elements) == 1
        assert emap.elements[0].selector == "#accept"
        assert emap.elements[0].area_ratio > 0

    def test_empty_dom_returns_empty_map(self) -> None:
        dom_metadata = {
            "interactive_elements": [],
            "hidden_elements": [],
            "prechecked_inputs": [],
            "url": "https://example.com",
        }
        emap = build_element_map(dom_metadata)
        assert len(emap.elements) == 0


class TestVisualAnalyzer:
    """Unit tests for VisualAnalyzerService."""

    def test_returns_empty_on_clean_page(self, service: VisualAnalyzerService) -> None:
        payload = {
            "dom_metadata": {
                "interactive_elements": [],
                "hidden_elements": [],
                "prechecked_inputs": [],
                "url": "https://example.com",
            },
            "screenshot_b64": "",
        }
        results = _run(service.analyze(payload))
        assert results == []

    def test_returns_empty_without_dom(self, service: VisualAnalyzerService) -> None:
        payload = {"screenshot_b64": "abc123"}
        results = _run(service.analyze(payload))
        assert results == []

    def test_confidence_scores_are_bounded(self, service: VisualAnalyzerService) -> None:
        # Without API key, heuristic fallback returns empty
        payload = {
            "dom_metadata": {
                "interactive_elements": [
                    {
                        "selector": "#btn",
                        "tag_name": "button",
                        "text_content": "Click",
                        "attributes": {},
                        "bounding_rect": {"x": 0, "y": 0, "width": 100, "height": 50},
                        "computed_styles": {
                            "color": "white",
                            "background_color": "blue",
                            "font_size": "14px",
                            "opacity": "1",
                            "display": "block",
                            "visibility": "visible",
                        },
                    }
                ],
                "hidden_elements": [],
                "prechecked_inputs": [],
                "url": "https://example.com",
            },
            "screenshot_b64": "",
        }
        results = _run(service.analyze(payload))
        for det in results:
            assert 0.0 <= det.confidence <= 1.0
