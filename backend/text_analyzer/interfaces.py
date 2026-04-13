"""
text_analyzer/interfaces.py — Payload/result types for the text analyzer.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class LabeledElement:
    """A text label tied to a DOM selector."""

    selector: str
    text: str


@dataclass
class TextPayload:
    """Structured input for the text analyzer."""

    button_labels: list[LabeledElement]
    headings: list[LabeledElement]
    body_text: str


@dataclass
class TextResult:
    """Output wrapper for text analysis results."""

    detections_count: int
