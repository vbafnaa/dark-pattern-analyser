"""Tests for the Review Analyzer."""

from __future__ import annotations

import asyncio

import pytest

from core.models import Detection
from review_analyzer.service import ReviewAnalyzerService


@pytest.fixture
def service() -> ReviewAnalyzerService:
    return ReviewAnalyzerService()


def _run(coro: object) -> list[Detection]:
    return asyncio.run(coro)  # type: ignore[arg-type]


class TestReviewAnalyzer:
    """Unit tests for ReviewAnalyzerService."""

    def test_detects_generic_praise_burst(self, service: ReviewAnalyzerService) -> None:
        fake_reviews = "\n---\n".join([
            "Amazing product! Highly recommend! Five stars!",
            "Great product! Must buy! Exceeded expectations!",
            "Excellent product! Highly recommend! Love it!",
            "Fantastic product! Best purchase! Five stars!",
            "Awesome product! Highly recommend! Perfect!",
        ])
        payload = {"review_text": fake_reviews, "url": "https://example.com"}
        results = _run(service.analyze(payload))
        assert len(results) >= 1
        assert results[0].category == "fake_social_proof"

    def test_returns_empty_on_clean_page(self, service: ReviewAnalyzerService) -> None:
        payload = {"review_text": None, "url": "https://example.com"}
        results = _run(service.analyze(payload))
        assert results == []

    def test_confidence_scores_are_bounded(self, service: ReviewAnalyzerService) -> None:
        fake_reviews = "\n---\n".join([
            "Amazing product! Highly recommend!",
            "Great product! Must buy!",
            "Excellent product! Five stars!",
        ])
        payload = {"review_text": fake_reviews, "url": "https://example.com"}
        results = _run(service.analyze(payload))
        for det in results:
            assert 0.0 <= det.confidence <= 1.0
