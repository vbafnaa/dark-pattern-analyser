"""
review_analyzer/interfaces.py — Payload/result types for the review analyzer.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ReviewPayload:
    """Structured input for the review analyzer."""

    review_text: str
    url: str


@dataclass
class ReviewResult:
    """Output wrapper for review analysis results."""

    detections_count: int
