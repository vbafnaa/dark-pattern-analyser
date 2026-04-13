// ──────────────────────────────────────────────
// DarkGuard — Overlay Renderer
// Injects shadow-DOM overlays on flagged elements.
// ──────────────────────────────────────────────

import type { Detection } from "../types/index";

/** Colour map by severity. */
const SEVERITY_COLORS: Record<string, string> = {
    high: "rgba(220, 38, 38, 0.6)",    // red
    medium: "rgba(245, 158, 11, 0.55)", // amber
    low: "rgba(59, 130, 246, 0.5)",     // blue
};

const OVERLAY_ATTR = "data-darkguard-overlay";

/** Remove all existing overlays from the page. */
export function clearOverlays(): void {
    const existing = document.querySelectorAll(`[${OVERLAY_ATTR}]`);
    existing.forEach((el) => el.remove());
}

/** Render detection overlays on the page. */
export function renderOverlays(detections: Detection[]): void {
    clearOverlays();

    for (const det of detections) {
        const target = document.querySelector(det.element_selector);
        if (!target) continue;

        const rect = target.getBoundingClientRect();

        // Create container with Shadow DOM to isolate styles
        const container = document.createElement("div");
        container.setAttribute(OVERLAY_ATTR, "true");
        container.style.cssText = `
      position: fixed;
      left: ${rect.left}px;
      top: ${rect.top}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      pointer-events: none;
      z-index: 2147483647;
    `;

        const shadow = container.attachShadow({ mode: "closed" });

        const borderColor = SEVERITY_COLORS[det.severity] ?? SEVERITY_COLORS["low"];
        const corroboratedBadge = det.corroborated
            ? '<span class="badge">⚠ Corroborated</span>'
            : "";

        shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }
        .overlay-border {
          position: absolute;
          inset: 0;
          border: 3px solid ${borderColor};
          border-radius: 4px;
          pointer-events: none;
          box-sizing: border-box;
        }
        .tooltip {
          position: absolute;
          bottom: calc(100% + 6px);
          left: 0;
          background: #1e1e2e;
          color: #cdd6f4;
          font: 13px/1.4 'Segoe UI', system-ui, sans-serif;
          padding: 8px 12px;
          border-radius: 8px;
          max-width: 320px;
          pointer-events: auto;
          opacity: 0;
          transition: opacity 0.15s ease;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
          z-index: 2147483647;
        }
        .overlay-border:hover ~ .tooltip,
        .tooltip:hover {
          opacity: 1;
        }
        .category {
          font-weight: 600;
          color: #f38ba8;
          margin-bottom: 4px;
          text-transform: capitalize;
        }
        .explanation {
          font-size: 12px;
          color: #a6adc8;
        }
        .confidence {
          font-size: 11px;
          color: #6c7086;
          margin-top: 4px;
        }
        .badge {
          display: inline-block;
          background: #f38ba8;
          color: #1e1e2e;
          font-size: 10px;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 4px;
          margin-left: 6px;
        }
      </style>
      <div class="overlay-border" style="pointer-events: auto; cursor: help;"></div>
      <div class="tooltip">
        <div class="category">
          ${det.category.replace(/_/g, " ")}${corroboratedBadge}
        </div>
        <div class="explanation">${det.explanation}</div>
        <div class="confidence">Confidence: ${Math.round(det.confidence * 100)}% · ${det.severity}</div>
      </div>
    `;

        document.body.appendChild(container);
    }
}

// ── Listen for detection results from the service worker ──
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "DETECTIONS_READY") {
        renderOverlays(message.detections as Detection[]);
    }
});
