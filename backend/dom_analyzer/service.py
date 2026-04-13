"""
dom_analyzer/service.py — DOM Analyzer Service.

Rules engine that detects dark patterns from DOM metadata:
- Visual interference (contrast ratios, size disparity)
- Pre-selected checkboxes
- Hidden elements that may be deceptive
"""

from __future__ import annotations

from core.interfaces import BaseAnalyzer
from core.models import Detection


class DomAnalyzerService(BaseAnalyzer):
    """Analyzes DOM metadata for dark-pattern signals."""

    async def analyze(self, payload: dict[str, object]) -> list[Detection]:
        detections: list[Detection] = []

        dom_metadata = payload.get("dom_metadata", {})
        if not isinstance(dom_metadata, dict):
            return detections

        # Check pre-selected inputs
        prechecked = dom_metadata.get("prechecked_inputs", [])
        if isinstance(prechecked, list):
            for el in prechecked:
                if isinstance(el, dict):
                    detections.append(
                        Detection(
                            category="preselection",
                            element_selector=el.get("selector", ""),
                            confidence=0.85,
                            explanation=(
                                "This checkbox/radio is pre-selected, which may "
                                "trick users into opting in unintentionally."
                            ),
                            severity="medium",
                        )
                    )

        # Check interactive element size disparity
        interactive = dom_metadata.get("interactive_elements", [])
        if isinstance(interactive, list):
            detections.extend(self._check_size_disparity(interactive))
            detections.extend(self._check_low_contrast(interactive))

        return detections

    def _check_size_disparity(
        self, elements: list[object]
    ) -> list[Detection]:
        """Flag button pairs where accept is much larger than decline."""
        detections: list[Detection] = []
        buttons: list[dict[str, object]] = [
            e for e in elements if isinstance(e, dict)
            and isinstance(e.get("tag_name"), str)
            and e.get("tag_name") in ("button", "a")
        ]

        for i, btn_a in enumerate(buttons):
            rect_a = btn_a.get("bounding_rect", {})
            if not isinstance(rect_a, dict):
                continue
            area_a = float(rect_a.get("width", 0)) * float(rect_a.get("height", 0))

            for btn_b in buttons[i + 1:]:
                rect_b = btn_b.get("bounding_rect", {})
                if not isinstance(rect_b, dict):
                    continue
                area_b = float(rect_b.get("width", 0)) * float(rect_b.get("height", 0))

                if area_a == 0 or area_b == 0:
                    continue

                ratio = max(area_a, area_b) / min(area_a, area_b)
                if ratio > 3.0:
                    smaller = btn_a if area_a < area_b else btn_b
                    selector = str(smaller.get("selector", ""))
                    detections.append(
                        Detection(
                            category="visual_interference",
                            element_selector=selector,
                            confidence=min(0.5 + (ratio - 3) * 0.1, 0.95),
                            explanation=(
                                f"This button is {ratio:.1f}× smaller than a "
                                f"nearby button, making it easy to overlook."
                            ),
                            severity="medium" if ratio < 5 else "high",
                        )
                    )
        return detections

    def _check_low_contrast(
        self, elements: list[object]
    ) -> list[Detection]:
        """Flag elements with very low text contrast (grey-on-grey)."""
        detections: list[Detection] = []

        for el in elements:
            if not isinstance(el, dict):
                continue
            styles = el.get("computed_styles", {})
            if not isinstance(styles, dict):
                continue

            opacity = styles.get("opacity", "1")
            try:
                opacity_val = float(opacity)
            except (ValueError, TypeError):
                opacity_val = 1.0

            if opacity_val < 0.4:
                detections.append(
                    Detection(
                        category="visual_interference",
                        element_selector=str(el.get("selector", "")),
                        confidence=0.8,
                        explanation=(
                            f"This element has very low opacity ({opacity_val:.2f}), "
                            f"making it hard to see or read."
                        ),
                        severity="medium",
                    )
                )

        return detections
