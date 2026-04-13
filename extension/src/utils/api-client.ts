// ──────────────────────────────────────────────
// DarkGuard — API Client
// Sends collected signals to the Django backend.
// ──────────────────────────────────────────────

import type { AnalyzeRequest, AnalyzeResponse } from "../types/index";

/** Default backend URL — can be overridden via chrome.storage. */
const DEFAULT_API_URL = "http://localhost:8000/api/analyze";

/** Get the configured API URL from storage, or fall back to default. */
async function getApiUrl(): Promise<string> {
    const result = await chrome.storage.local.get("apiUrl");
    return (result["apiUrl"] as string | undefined) ?? DEFAULT_API_URL;
}

/**
 * Send analysis payload to the DarkGuard backend.
 * Throws on network errors or non-2xx responses.
 */
export async function analyzePageSignals(
    request: AnalyzeRequest
): Promise<AnalyzeResponse> {
    const apiUrl = await getApiUrl();

    const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(
            `DarkGuard API error (${response.status}): ${text.slice(0, 200)}`
        );
    }

    return (await response.json()) as AnalyzeResponse;
}
