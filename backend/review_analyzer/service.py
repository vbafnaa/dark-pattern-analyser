"""
review_analyzer/service.py — Review Analyzer Service.

Detects fake social proof by analyzing review text:
- Burst patterns (many similar reviews in a short span)
- Templated/repetitive praise
- Suspiciously generic language via LLM
"""

from __future__ import annotations

import json
import logging
import re
from collections import Counter

from django.conf import settings

from core.interfaces import BaseAnalyzer
from core.models import Detection

logger = logging.getLogger(__name__)

# Heuristic patterns for fake reviews
GENERIC_PRAISE_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"(great|amazing|excellent|fantastic|awesome)\s+(product|item|purchase)", re.IGNORECASE),
    re.compile(r"(highly\s+recommend|must\s+buy|best\s+purchase)", re.IGNORECASE),
    re.compile(r"(five\s+stars?|5\s+stars?|⭐{3,})", re.IGNORECASE),
    re.compile(r"(exceeded\s+expectations?|love\s+it|perfect)", re.IGNORECASE),
]

SYSTEM_PROMPT = """You are a fake-review detection expert. Analyze the following review texts
and identify signs of fake social proof or manipulated reviews.

Look for:
1. Templated/repetitive language across reviews
2. Suspiciously generic praise without specific details
3. Burst patterns (many similar-sounding reviews)
4. Overly positive language with no constructive criticism

For each issue found, respond with a JSON array of objects:
[
  {
    "category": "fake_social_proof",
    "confidence": 0.0-1.0,
    "explanation": "brief explanation",
    "severity": "low" or "medium" or "high"
  }
]

If no issues are found, respond with an empty array: []
Respond ONLY with the JSON array, no other text."""


class ReviewAnalyzerService(BaseAnalyzer):
    """Analyzes review text for fake social-proof patterns."""

    async def analyze(self, payload: dict[str, object]) -> list[Detection]:
        review_text = payload.get("review_text")
        if not review_text or not isinstance(review_text, str):
            return []

        review_text = review_text.strip()
        if len(review_text) < 20:
            return []

        # Split into individual reviews
        reviews = [r.strip() for r in review_text.split("---") if r.strip()]

        # Heuristic analysis first
        detections = self._heuristic_analysis(reviews)

        # LLM analysis if API key is available
        api_key = getattr(settings, "GOOGLE_API_KEY", "")
        if api_key and len(reviews) >= 3:
            llm_detections = await self._llm_analysis(review_text, api_key)
            detections.extend(llm_detections)

        return detections

    def _heuristic_analysis(self, reviews: list[str]) -> list[Detection]:
        """Rule-based fake review detection."""
        detections: list[Detection] = []

        if len(reviews) < 2:
            return detections

        # Check for generic praise patterns
        generic_count = 0
        for review in reviews:
            for pattern in GENERIC_PRAISE_PATTERNS:
                if pattern.search(review):
                    generic_count += 1
                    break

        if len(reviews) >= 3 and generic_count / len(reviews) > 0.6:
            detections.append(
                Detection(
                    category="fake_social_proof",
                    element_selector="[itemprop='reviewBody']",
                    confidence=0.7,
                    explanation=(
                        f"{generic_count} of {len(reviews)} reviews use generic "
                        f"praise patterns, suggesting templated or fake reviews."
                    ),
                    severity="medium",
                )
            )

        # Check for suspiciously similar reviews (burst pattern)
        if len(reviews) >= 5:
            # Simple similarity: count reviews that share 3+ consecutive words
            similar_pairs = 0
            total_pairs = 0
            words_per_review = [set(r.lower().split()) for r in reviews]

            for i in range(len(reviews)):
                for j in range(i + 1, len(reviews)):
                    total_pairs += 1
                    overlap = words_per_review[i] & words_per_review[j]
                    if len(overlap) > max(5, min(len(words_per_review[i]), len(words_per_review[j])) * 0.4):
                        similar_pairs += 1

            if total_pairs > 0 and similar_pairs / total_pairs > 0.3:
                detections.append(
                    Detection(
                        category="fake_social_proof",
                        element_selector="[itemprop='reviewBody']",
                        confidence=0.75,
                        explanation=(
                            f"{similar_pairs} review pairs share unusually high "
                            f"word overlap, suggesting burst-generated reviews."
                        ),
                        severity="high",
                    )
                )

        return detections

    async def _llm_analysis(
        self, review_text: str, api_key: str
    ) -> list[Detection]:
        """LLM-based fake review detection."""
        detections: list[Detection] = []

        try:
            from google import genai

            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=f"{SYSTEM_PROMPT}\n\n---\n\n{review_text[:3000]}",
            )

            response_text = response.text or "[]"

            if response_text.startswith("```"):
                lines = response_text.strip().split("\n")
                response_text = "\n".join(lines[1:-1])

            raw_detections = json.loads(response_text)

            if isinstance(raw_detections, list):
                for item in raw_detections:
                    if isinstance(item, dict):
                        detections.append(
                            Detection(
                                category="fake_social_proof",
                                element_selector="[itemprop='reviewBody']",
                                confidence=float(item.get("confidence", 0.5)),
                                explanation=str(item.get("explanation", "")),
                                severity=str(item.get("severity", "medium")),  # type: ignore[arg-type]
                            )
                        )

        except Exception:
            logger.exception("Review analyzer LLM call failed")

        return detections
