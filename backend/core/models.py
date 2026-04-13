"""
core/models.py — Detection dataclass.

Represents a single dark-pattern detection returned by any analyzer.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal


Severity = Literal["low", "medium", "high"]
UserFeedback = Literal["false_positive", "confirmed"] | None


@dataclass
class Detection:
    """A single dark-pattern detection."""

    category: str
    """Taxonomy category (e.g. 'confirmshaming', 'urgency_scarcity')."""

    element_selector: str
    """CSS selector of the flagged element on the page."""

    confidence: float
    """Confidence score between 0.0 and 1.0."""

    explanation: str
    """Human-readable explanation of why this was flagged."""

    severity: Severity
    """Impact severity: low, medium, or high."""

    corroborated: bool = field(default=False)
    """True when 2+ analyzers independently flagged this element+category."""

    user_feedback: UserFeedback = field(default=None)
    """User feedback for model fine-tuning: null, 'false_positive', or 'confirmed'."""

    def __post_init__(self) -> None:
        if not 0.0 <= self.confidence <= 1.0:
            raise ValueError(
                f"confidence must be between 0 and 1, got {self.confidence}"
            )
        if self.severity not in ("low", "medium", "high"):
            raise ValueError(
                f"severity must be 'low', 'medium', or 'high', got {self.severity!r}"
            )
