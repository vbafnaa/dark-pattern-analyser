"""
visual_analyzer/interfaces.py — Payload/result types for the visual analyzer.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class ElementMapEntry:
    """A single element in the structured ElementMap."""

    selector: str
    tag_name: str
    text_content: str
    x: float
    y: float
    width: float
    height: float
    color: str
    background_color: str
    font_size: str
    opacity: str
    area_ratio: float  # element area / viewport area


@dataclass
class ElementMap:
    """Structured representation of page elements and their spatial layout."""

    viewport_width: float
    viewport_height: float
    elements: list[ElementMapEntry]
    url: str


@dataclass
class VisualPayload:
    """Input for the visual analyzer: screenshot + DOM metadata."""

    screenshot_b64: str
    dom_metadata: dict[str, object]


@dataclass
class VisualResult:
    """Output wrapper for visual analysis results."""

    detections_count: int
