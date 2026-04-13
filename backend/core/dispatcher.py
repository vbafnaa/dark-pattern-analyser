"""
core/dispatcher.py — Async fan-out dispatcher.

Runs all 4 analyzers concurrently via asyncio.gather() with per-analyzer
timeouts. Merges results and sets the `corroborated` flag on detections
where 2+ analyzers agree on the same element + category.
"""

from __future__ import annotations

import asyncio
import logging
from collections import defaultdict

from django.conf import settings

from core.interfaces import BaseAnalyzer
from core.models import Detection

logger = logging.getLogger(__name__)


def _get_analyzer_timeout() -> float:
    """Read timeout from Django settings (default: 10s)."""
    return float(getattr(settings, "ANALYZER_TIMEOUT", 10))


async def _run_analyzer(
    name: str,
    analyzer: BaseAnalyzer,
    payload: dict[str, object],
    timeout: float,
) -> list[Detection]:
    """Run a single analyzer with a timeout, returning [] on failure."""
    try:
        return await asyncio.wait_for(
            analyzer.analyze(payload),
            timeout=timeout,
        )
    except asyncio.TimeoutError:
        logger.warning("Analyzer %s timed out after %.1fs", name, timeout)
        return []
    except Exception:
        logger.exception("Analyzer %s raised an unexpected error", name)
        return []


def _set_corroborated(detections: list[Detection]) -> list[Detection]:
    """
    Mark detections as corroborated when 2+ analyzers flagged the
    same (element_selector, category) pair.
    """
    counts: dict[tuple[str, str], list[Detection]] = defaultdict(list)

    for det in detections:
        key = (det.element_selector, det.category)
        counts[key].append(det)

    for group in counts.values():
        if len(group) >= 2:
            for det in group:
                det.corroborated = True

    return detections


async def dispatch(
    analyzers: dict[str, BaseAnalyzer],
    payload: dict[str, object],
) -> list[Detection]:
    """
    Fan out to all analyzers concurrently, merge & deduplicate results.

    Args:
        analyzers: Mapping of analyzer name → instance.
        payload: The full request payload.

    Returns:
        Merged, deduplicated list of Detections sorted by confidence desc.
    """
    timeout = _get_analyzer_timeout()

    tasks = [
        _run_analyzer(name, analyzer, payload, timeout)
        for name, analyzer in analyzers.items()
    ]

    results = await asyncio.gather(*tasks)

    # Flatten all detections
    all_detections: list[Detection] = []
    for result_list in results:
        all_detections.extend(result_list)

    # Deduplicate: keep the highest-confidence detection per (selector, category)
    seen: dict[tuple[str, str], Detection] = {}
    for det in all_detections:
        key = (det.element_selector, det.category)
        if key not in seen or det.confidence > seen[key].confidence:
            seen[key] = det

    # But we still need corroboration info from the full list
    deduped = list(seen.values())
    _set_corroborated(all_detections)  # marks on original objects

    # Transfer corroborated flag to deduped
    for det in deduped:
        key = (det.element_selector, det.category)
        corroborated_any = any(
            d.corroborated for d in all_detections
            if (d.element_selector, d.category) == key
        )
        det.corroborated = corroborated_any

    # Sort by confidence descending
    deduped.sort(key=lambda d: d.confidence, reverse=True)

    return deduped
