"""
visual_analyzer/service.py — Visual Analyzer Service.

Converts screenshot + DOM metadata into an ElementMap, then sends it
to an LLM for reasoning about visual dark patterns (layout anomalies,
visual interference, misdirection through design).
"""

from __future__ import annotations

import json
import logging
from dataclasses import asdict

from django.conf import settings

from core.interfaces import BaseAnalyzer
from core.models import Detection
from visual_analyzer.element_map_builder import build_element_map, element_map_to_prompt

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a dark-pattern detection expert. Analyze the following structured
page layout (ElementMap) and identify visual dark patterns.

Look for:
1. Visual Interference: buttons with drastically different sizes, low-contrast text/buttons,
   elements with very low opacity that are hard to see
2. Misdirection: prominent "accept" buttons with tiny/hidden "decline" buttons,
   visual hierarchy that steers users toward a specific action

For each issue found, respond with a JSON array of objects:
[
  {
    "selector": "CSS selector of the element",
    "category": "visual_interference" or "misdirection",
    "confidence": 0.0-1.0,
    "explanation": "brief explanation",
    "severity": "low" or "medium" or "high"
  }
]

If no issues are found, respond with an empty array: []
Respond ONLY with the JSON array, no other text."""


class VisualAnalyzerService(BaseAnalyzer):
    """Analyzes page layout via ElementMap → LLM reasoning."""

    async def analyze(self, payload: dict[str, object]) -> list[Detection]:
        detections: list[Detection] = []

        dom_metadata = payload.get("dom_metadata")
        if not isinstance(dom_metadata, dict):
            return detections

        # Build the ElementMap from DOM metadata
        element_map = build_element_map(dom_metadata)

        if not element_map.elements:
            return detections

        # Convert to prompt text
        prompt = element_map_to_prompt(element_map)

        # Check if Google API key is configured
        api_key = getattr(settings, "GOOGLE_API_KEY", "")
        if not api_key:
            logger.warning(
                "GOOGLE_API_KEY not configured — visual analyzer returning "
                "ElementMap-only heuristic results."
            )
            # Fall back to heuristic analysis from ElementMap
            return self._heuristic_analysis(element_map)

        try:
            from google import genai

            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=f"{SYSTEM_PROMPT}\n\n---\n\n{prompt}",
            )

            response_text = response.text or "[]"

            # Strip markdown fences if present
            if response_text.startswith("```"):
                lines = response_text.strip().split("\n")
                response_text = "\n".join(lines[1:-1])

            raw_detections = json.loads(response_text)

            if isinstance(raw_detections, list):
                for item in raw_detections:
                    if isinstance(item, dict):
                        detections.append(
                            Detection(
                                category=str(item.get("category", "visual_interference")),
                                element_selector=str(item.get("selector", "")),
                                confidence=float(item.get("confidence", 0.5)),
                                explanation=str(item.get("explanation", "")),
                                severity=str(item.get("severity", "medium")),  # type: ignore[arg-type]
                            )
                        )

        except Exception:
            logger.exception("Visual analyzer LLM call failed, falling back to heuristics")
            return self._heuristic_analysis(element_map)

        return detections

    def _heuristic_analysis(self, element_map: object) -> list[Detection]:
        """Fallback heuristic analysis when LLM is unavailable."""
        # ElementMap heuristics are handled by the DOM analyzer already;
        # this is a stub for when the visual analyzer has no LLM access.
        _ = element_map
        return []
