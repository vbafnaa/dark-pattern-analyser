// ──────────────────────────────────────────────
// DarkGuard — Overlay Renderer
// Injects shadow-DOM overlays on flagged elements.
// Handles scroll, resize, and dynamic DOM changes.
// ──────────────────────────────────────────────

import type { Detection } from "../types/index";

/** Colour map by severity. */
const SEVERITY_COLORS: Record<string, string> = {
    high: "rgba(220, 38, 38, 0.6)",    // red
    medium: "rgba(245, 158, 11, 0.55)", // amber
    low: "rgba(59, 130, 246, 0.5)",     // blue
};

const OVERLAY_ATTR = "data-darkguard-overlay";

/** Active detections used for re-positioning on scroll/resize. */
let activeDetections: Detection[] = [];

/** Map of overlay containers keyed by detection index for fast repositioning. */
let overlayElements: Map<number, HTMLDivElement> = new Map();

/** Throttle flag for scroll/resize handler. */
let repositionScheduled = false;

/** MutationObserver for detecting new DOM elements (cookie popups, modals). */
let domObserver: MutationObserver | null = null;

// ── Helpers ──────────────────────────────────────

/** Check whether an element (or any ancestor) has fixed or sticky positioning. */
function isFixedOrSticky(el: Element): boolean {
    let current: Element | null = el;
    while (current && current !== document.documentElement) {
        const pos = window.getComputedStyle(current).position;
        if (pos === "fixed" || pos === "sticky") return true;
        current = current.parentElement;
    }
    return false;
}

/**
 * Compute the position and sizing for an overlay container.
 * - For fixed/sticky elements: use `position: fixed` with viewport coords.
 * - For normal elements: use `position: absolute` with document-relative coords.
 */
function computeOverlayStyle(
    target: Element
): { cssText: string; isFixed: boolean } {
    const rect = target.getBoundingClientRect();
    const fixed = isFixedOrSticky(target);

    if (fixed) {
        return {
            isFixed: true,
            cssText: `
                position: fixed;
                left: ${rect.left}px;
                top: ${rect.top}px;
                width: ${rect.width}px;
                height: ${rect.height}px;
                pointer-events: none;
                z-index: 2147483647;
            `,
        };
    }

    // Document-relative positioning — scrolls naturally with the page
    const left = rect.left + window.scrollX;
    const top = rect.top + window.scrollY;
    return {
        isFixed: false,
        cssText: `
            position: absolute;
            left: ${left}px;
            top: ${top}px;
            width: ${rect.width}px;
            height: ${rect.height}px;
            pointer-events: none;
            z-index: 2147483647;
        `,
    };
}

// ── Overlay shadow-DOM content ───────────────────

function buildShadowContent(det: Detection): string {
    const borderColor =
        SEVERITY_COLORS[det.severity] ?? SEVERITY_COLORS["low"];
    const corroboratedBadge = det.corroborated
        ? '<span class="badge">⚠ Corroborated</span>'
        : "";

    return `
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
}

// ── Core API ─────────────────────────────────────

/** Remove all existing overlays from the page and clean up listeners. */
export function clearOverlays(): void {
    const existing = document.querySelectorAll(`[${OVERLAY_ATTR}]`);
    existing.forEach((el) => el.remove());
    overlayElements.clear();
    activeDetections = [];
}

/** Reposition all overlay containers to match their current target positions. */
function repositionOverlays(): void {
    for (const [idx, container] of overlayElements.entries()) {
        const det = activeDetections[idx];
        if (!det) continue;

        const target = document.querySelector(det.element_selector);
        if (!target) {
            // Target is gone (e.g. modal closed) — hide overlay
            container.style.display = "none";
            continue;
        }

        container.style.display = "";
        const { cssText } = computeOverlayStyle(target);
        container.style.cssText = cssText;
    }
}

/** Throttled reposition — called on scroll/resize. */
function scheduleReposition(): void {
    if (repositionScheduled) return;
    repositionScheduled = true;
    requestAnimationFrame(() => {
        repositionOverlays();
        repositionScheduled = false;
    });
}

/** Render detection overlays on the page. */
export function renderOverlays(detections: Detection[]): void {
    clearOverlays();
    activeDetections = detections;

    for (let i = 0; i < detections.length; i++) {
        const det = detections[i];
        const target = document.querySelector(det.element_selector);
        if (!target) continue;

        const { cssText } = computeOverlayStyle(target);

        // Create container with Shadow DOM to isolate styles
        const container = document.createElement("div");
        container.setAttribute(OVERLAY_ATTR, "true");
        container.style.cssText = cssText;

        const shadow = container.attachShadow({ mode: "closed" });
        shadow.innerHTML = buildShadowContent(det);

        document.body.appendChild(container);
        overlayElements.set(i, container);
    }

    // Start listening for scroll/resize to reposition overlays
    startTrackingListeners();
}

// ── Event listeners ──────────────────────────────

function startTrackingListeners(): void {
    // Scroll — use capture phase to catch scrolls on any element
    window.addEventListener("scroll", scheduleReposition, { passive: true, capture: true });
    window.addEventListener("resize", scheduleReposition, { passive: true });

    // Observe DOM for new elements (cookie popups, modals injected dynamically)
    if (domObserver) domObserver.disconnect();
    domObserver = new MutationObserver(() => {
        // When DOM changes, reposition overlays (targets may have moved or appeared)
        scheduleReposition();
    });
    domObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"],
    });
}

// ── Listen for detection results from the service worker ──
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === "DETECTIONS_READY") {
        renderOverlays(message.detections as Detection[]);
    }
});
