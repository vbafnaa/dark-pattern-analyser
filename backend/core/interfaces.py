"""
core/interfaces.py — BaseAnalyzer abstract base class.

Every analyzer module inherits from this and implements `analyze()`.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from core.models import Detection


class BaseAnalyzer(ABC):
    """Abstract base class for all dark-pattern analyzers."""

    @abstractmethod
    async def analyze(self, payload: dict[str, object]) -> list[Detection]:
        """
        Analyze a payload and return a list of detections.

        Args:
            payload: The full request payload (each analyzer picks its keys).

        Returns:
            A list of Detection instances found by this analyzer.
        """
        ...
