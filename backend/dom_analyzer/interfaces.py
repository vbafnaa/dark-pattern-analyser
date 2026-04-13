"""
dom_analyzer/interfaces.py — Payload/result types for the DOM analyzer.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class DomElementInfo:
    """Subset of element data relevant to DOM analysis."""

    selector: str
    tag_name: str
    text_content: str
    attributes: dict[str, str]
    bounding_rect: dict[str, float]
    computed_styles: dict[str, str]


@dataclass
class DomPayload:
    """Structured input for the DOM analyzer."""

    hidden_elements: list[DomElementInfo]
    interactive_elements: list[DomElementInfo]
    prechecked_inputs: list[DomElementInfo]
    url: str


@dataclass
class DomResult:
    """Output wrapper for DOM analysis results."""

    detections_count: int
