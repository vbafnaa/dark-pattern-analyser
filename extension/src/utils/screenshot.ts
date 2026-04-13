// ──────────────────────────────────────────────
// DarkGuard — Screenshot utility
// Captures the visible tab as a base64-encoded PNG.
// ──────────────────────────────────────────────

/** Capture the currently visible tab as a base64 PNG data URL. */
export async function captureScreenshot(): Promise<string> {
    const dataUrl = await chrome.tabs.captureVisibleTab({ format: "png" });
    // Strip the data:image/png;base64, prefix — backend expects raw base64
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    return base64;
}
