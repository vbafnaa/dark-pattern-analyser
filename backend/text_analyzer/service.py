"""
text_analyzer/service.py — Text Analyzer Service.

Pattern-matching / NLP rules for detecting dark patterns in text:
- Confirmshaming (guilt-tripping decline copy)
- Urgency / scarcity language
- Misdirection (misleading button labels)
"""

from __future__ import annotations

import re

from core.interfaces import BaseAnalyzer
from core.models import Detection


# ── Pattern libraries ─────────────────────────────────────

CONFIRMSHAMING_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"no\s*,?\s*i\s+don'?t\s+want", re.IGNORECASE),
    re.compile(r"no\s+thanks?\s*,?\s+i('?d)?\s*(rather|prefer|like)", re.IGNORECASE),
    re.compile(r"i\s+don'?t\s+(care|like|want)\s+(about\s+|to\s+)?(sav|deal|discount|money)", re.IGNORECASE),
    re.compile(r"i('?ll)?\s*(pay|stay)\s+(full\s+price|more)", re.IGNORECASE),
    re.compile(r"no\s*,?\s*i\s+hate\s+(saving|money)", re.IGNORECASE),
    re.compile(r"i\s+prefer\s+not\s+to\s+save", re.IGNORECASE),
]

URGENCY_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"only\s+\d+\s+(left|remaining|available)", re.IGNORECASE),
    re.compile(r"(offer|sale|deal|discount)\s+(expires?|ends?)\s+(soon|today|in\s+\d)", re.IGNORECASE),
    re.compile(r"(hurry|act\s+now|don'?t\s+miss|limited\s+time)", re.IGNORECASE),
    re.compile(r"\d+\s+(people|others?)\s+(are\s+)?(viewing|watching|looking)", re.IGNORECASE),
    re.compile(r"(selling|going)\s+fast", re.IGNORECASE),
    re.compile(r"(last|final)\s+chance", re.IGNORECASE),
]

MISDIRECTION_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (
        re.compile(r"^continue$", re.IGNORECASE),
        "A button labeled 'Continue' may actually mean 'Subscribe' or 'Accept'.",
    ),
    (
        re.compile(r"^(get\s+started|start\s+now)$", re.IGNORECASE),
        "Generic action label may hide subscription or commitment.",
    ),
    (
        re.compile(r"^(claim|unlock|activate)\b", re.IGNORECASE),
        "Action-oriented label may disguise paid commitment or data collection.",
    ),
]


# TODO(roberta): Replace regex patterns with a fine-tuned RoBERTa classifier.
# Integration point: load a HuggingFace `transformers` pipeline here for
# confirmshaming / urgency / misdirection classification. The regex rules
# above should remain as a fast-path fallback when the model is unavailable.
# Expected model: fine-tuned roberta-base on dark-pattern text corpus.
# See: https://huggingface.co/docs/transformers/model_doc/roberta


class TextAnalyzerService(BaseAnalyzer):
    """Analyzes visible text for dark-pattern signals."""

    async def analyze(self, payload: dict[str, object]) -> list[Detection]:
        detections: list[Detection] = []

        text_content = payload.get("text_content", {})
        if not isinstance(text_content, dict):
            return detections

        button_labels = text_content.get("button_labels", [])
        body_text = str(text_content.get("body_text", ""))

        if isinstance(button_labels, list):
            detections.extend(self._check_confirmshaming(button_labels))
            detections.extend(self._check_misdirection(button_labels))

        detections.extend(self._check_urgency(body_text))

        return detections

    def _check_confirmshaming(
        self, labels: list[object]
    ) -> list[Detection]:
        """Detect guilt-tripping decline copy on buttons/links."""
        detections: list[Detection] = []
        for lbl in labels:
            if not isinstance(lbl, dict):
                continue
            text = str(lbl.get("text", ""))
            for pattern in CONFIRMSHAMING_PATTERNS:
                if pattern.search(text):
                    detections.append(
                        Detection(
                            category="confirmshaming",
                            element_selector=str(lbl.get("selector", "")),
                            confidence=0.85,
                            explanation=(
                                f'The decline option uses guilt-tripping language: "{text}"'
                            ),
                            severity="medium",
                        )
                    )
                    break  # one match per label
        return detections

    def _check_urgency(self, body_text: str) -> list[Detection]:
        """Detect artificial urgency/scarcity language."""
        detections: list[Detection] = []
        for pattern in URGENCY_PATTERNS:
            match = pattern.search(body_text)
            if match:
                snippet = body_text[max(0, match.start() - 20):match.end() + 20]
                detections.append(
                    Detection(
                        category="urgency_scarcity",
                        element_selector="body",
                        confidence=0.7,
                        explanation=(
                            f'Urgency/scarcity language detected: "…{snippet.strip()}…"'
                        ),
                        severity="low",
                    )
                )
        return detections

    def _check_misdirection(
        self, labels: list[object]
    ) -> list[Detection]:
        """Detect misleading button labels."""
        detections: list[Detection] = []
        for lbl in labels:
            if not isinstance(lbl, dict):
                continue
            text = str(lbl.get("text", "")).strip()
            for pattern, explanation in MISDIRECTION_PATTERNS:
                if pattern.match(text):
                    detections.append(
                        Detection(
                            category="misdirection",
                            element_selector=str(lbl.get("selector", "")),
                            confidence=0.6,
                            explanation=explanation,
                            severity="low",
                        )
                    )
                    break
        return detections
