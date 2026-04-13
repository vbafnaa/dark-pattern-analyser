// ──────────────────────────────────────────────
// DarkGuard — DOM / Text Collector
// Scrapes DOM metadata and visible text from the active page.
// ──────────────────────────────────────────────

import type {
    CollectorPayload,
    DomMetadata,
    TextContent,
    ElementInfo,
    BoundingRect,
    ComputedStyleInfo,
    LabeledElement,
} from "../types/index";
import {
    sanitizeDomMetadata,
    sanitizeTextContent,
    sanitizeReviewText,
} from "./sanitizer";

/** Maximum body text length to send to the backend. */
const MAX_BODY_TEXT_LENGTH = 5000;

/** Build a unique CSS selector for an element. */
function buildSelector(el: Element): string {
    if (el.id) return `#${CSS.escape(el.id)}`;

    const parts: string[] = [];
    let current: Element | null = el;

    while (current && current !== document.documentElement) {
        let selector = current.tagName.toLowerCase();
        if (current.id) {
            selector = `#${CSS.escape(current.id)}`;
            parts.unshift(selector);
            break;
        }

        const parent = current.parentElement;
        if (parent) {
            const siblings = Array.from(parent.children).filter(
                (c) => c.tagName === current!.tagName
            );
            if (siblings.length > 1) {
                const index = siblings.indexOf(current) + 1;
                selector += `:nth-of-type(${index})`;
            }
        }
        parts.unshift(selector);
        current = parent;
    }

    return parts.join(" > ");
}

function getBoundingRect(el: Element): BoundingRect {
    const rect = el.getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
}

function getComputedStyleInfo(el: Element): ComputedStyleInfo {
    const styles = window.getComputedStyle(el);
    return {
        color: styles.color,
        background_color: styles.backgroundColor,
        font_size: styles.fontSize,
        opacity: styles.opacity,
        display: styles.display,
        visibility: styles.visibility,
    };
}

function toElementInfo(el: Element): ElementInfo {
    const attrs: Record<string, string> = {};
    for (const attr of Array.from(el.attributes)) {
        attrs[attr.name] = attr.value;
    }
    return {
        selector: buildSelector(el),
        tag_name: el.tagName.toLowerCase(),
        text_content: (el.textContent ?? "").trim().slice(0, 200),
        attributes: attrs,
        bounding_rect: getBoundingRect(el),
        computed_styles: getComputedStyleInfo(el),
    };
}

/** Collect hidden elements (display:none, visibility:hidden, opacity:0). */
function collectHiddenElements(): ElementInfo[] {
    const results: ElementInfo[] = [];
    const all = document.querySelectorAll("*");

    for (const el of all) {
        const styles = window.getComputedStyle(el);
        if (
            styles.display === "none" ||
            styles.visibility === "hidden" ||
            styles.opacity === "0"
        ) {
            results.push(toElementInfo(el));
            if (results.length >= 50) break; // cap to avoid huge payloads
        }
    }
    return results;
}

/** Collect interactive elements (buttons, links, inputs). */
function collectInteractiveElements(): ElementInfo[] {
    const selectors =
        'button, [role="button"], a[href], input[type="submit"], input[type="button"], select';
    const elements = document.querySelectorAll(selectors);
    return Array.from(elements).slice(0, 100).map(toElementInfo);
}

/** Collect pre-checked checkboxes and radio buttons. */
function collectPrecheckedInputs(): ElementInfo[] {
    const inputs = document.querySelectorAll<HTMLInputElement>(
        'input[type="checkbox"]:checked, input[type="radio"]:checked'
    );
    return Array.from(inputs).map(toElementInfo);
}

/** Collect button / CTA labels. */
function collectButtonLabels(): LabeledElement[] {
    const btns = document.querySelectorAll(
        'button, [role="button"], a[href], input[type="submit"]'
    );
    return Array.from(btns)
        .slice(0, 100)
        .map((el) => ({
            selector: buildSelector(el),
            text: (el.textContent ?? "").trim().slice(0, 200),
        }))
        .filter((lbl) => lbl.text.length > 0);
}

/** Collect heading texts. */
function collectHeadings(): LabeledElement[] {
    const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
    return Array.from(headings)
        .slice(0, 50)
        .map((el) => ({
            selector: buildSelector(el),
            text: (el.textContent ?? "").trim().slice(0, 300),
        }));
}

/** Attempt to collect review text from common review containers. */
function collectReviewText(): string | null {
    const reviewSelectors = [
        '[data-hook="review-body"]',        // Amazon
        ".review-text",
        ".reviewText",
        '[itemprop="reviewBody"]',
        ".comment-body",
        ".user-review",
    ];

    const reviews: string[] = [];
    for (const sel of reviewSelectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
            const text = (el.textContent ?? "").trim();
            if (text.length > 10) {
                reviews.push(text.slice(0, 500));
            }
            if (reviews.length >= 20) break;
        }
        if (reviews.length >= 20) break;
    }

    return reviews.length > 0 ? reviews.join("\n---\n") : null;
}

/** Main collection entrypoint — collects and sanitizes all signals. */
export function collectPageSignals(): CollectorPayload {
    const domMetadata: DomMetadata = {
        hidden_elements: collectHiddenElements(),
        interactive_elements: collectInteractiveElements(),
        prechecked_inputs: collectPrecheckedInputs(),
        url: window.location.href,
    };

    const textContent: TextContent = {
        button_labels: collectButtonLabels(),
        headings: collectHeadings(),
        body_text: (document.body.innerText ?? "").slice(0, MAX_BODY_TEXT_LENGTH),
    };

    const reviewText = collectReviewText();

    return {
        dom_metadata: sanitizeDomMetadata(domMetadata),
        text_content: sanitizeTextContent(textContent),
        review_text: sanitizeReviewText(reviewText),
    };
}

// ── Content-script entry point ──────────────────────────
// Listen for analysis triggers from the service worker.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "COLLECT_SIGNALS") {
        const payload = collectPageSignals();
        sendResponse(payload);
    }
    return true; // keep channel open for async response
});
