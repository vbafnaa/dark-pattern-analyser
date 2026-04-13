<script lang="ts">
  import type { Detection } from "../types/index";

  interface StorageState {
    lastDetections?: Detection[];
    lastUrl?: string;
    lastTimestamp?: string;
    lastError?: string;
  }

  let detections: Detection[] = $state([]);
  let pageUrl: string = $state("");
  let timestamp: string = $state("");
  let error: string = $state("");
  let loading: boolean = $state(false);

  async function loadResults(): Promise<void> {
    const data = (await chrome.storage.local.get([
      "lastDetections",
      "lastUrl",
      "lastTimestamp",
      "lastError",
    ])) as StorageState;

    detections = data.lastDetections ?? [];
    pageUrl = data.lastUrl ?? "";
    timestamp = data.lastTimestamp ?? "";
    error = data.lastError ?? "";
  }

  async function triggerScan(): Promise<void> {
    loading = true;
    error = "";
    try {
      await chrome.runtime.sendMessage({ type: "TRIGGER_ANALYSIS" });
      // Wait a moment for storage to update, then reload
      await new Promise((r) => setTimeout(r, 500));
      await loadResults();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      loading = false;
    }
  }

  function severityColor(severity: string): string {
    switch (severity) {
      case "high":
        return "#f38ba8";
      case "medium":
        return "#fab387";
      case "low":
        return "#89b4fa";
      default:
        return "#a6adc8";
    }
  }

  function formatCategory(cat: string): string {
    return cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }

  // Load results on mount
  loadResults();
</script>

<main>
  <header>
    <h1>🛡️ DarkGuard</h1>
    <button class="scan-btn" onclick={triggerScan} disabled={loading}>
      {loading ? "Scanning…" : "Scan Page"}
    </button>
  </header>

  {#if error}
    <div class="error-banner">{error}</div>
  {/if}

  {#if detections.length === 0 && !loading}
    <div class="empty-state">
      <p>No dark patterns detected yet.</p>
      <p class="hint">Click <strong>Scan Page</strong> to analyze.</p>
    </div>
  {:else}
    <div class="summary">
      <span class="count">{detections.length}</span> pattern{detections.length === 1 ? "" : "s"} found
      {#if timestamp}
        <span class="time">· {new Date(timestamp).toLocaleTimeString()}</span>
      {/if}
    </div>

    <ul class="detection-list">
      {#each detections as det}
        <li class="detection-item">
          <div class="det-header">
            <span class="category" style="color: {severityColor(det.severity)}">
              {formatCategory(det.category)}
            </span>
            {#if det.corroborated}
              <span class="badge">corroborated</span>
            {/if}
            <span class="confidence">{Math.round(det.confidence * 100)}%</span>
          </div>
          <p class="explanation">{det.explanation}</p>
        </li>
      {/each}
    </ul>
  {/if}

  {#if pageUrl}
    <footer>
      <span class="url" title={pageUrl}>
        {pageUrl.length > 40 ? pageUrl.slice(0, 40) + "…" : pageUrl}
      </span>
    </footer>
  {/if}
</main>

<style>
  main {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  h1 {
    font-size: 18px;
    margin: 0;
    color: #cdd6f4;
  }

  .scan-btn {
    background: linear-gradient(135deg, #89b4fa, #cba6f7);
    color: #1e1e2e;
    border: none;
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .scan-btn:hover {
    opacity: 0.85;
  }

  .scan-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-banner {
    background: rgba(243, 139, 168, 0.15);
    border: 1px solid #f38ba8;
    color: #f38ba8;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 12px;
  }

  .empty-state {
    text-align: center;
    padding: 24px 0;
    color: #6c7086;
  }

  .empty-state .hint {
    font-size: 12px;
    margin-top: 4px;
  }

  .summary {
    font-size: 14px;
    color: #a6adc8;
  }

  .summary .count {
    font-weight: 700;
    color: #f38ba8;
    font-size: 18px;
  }

  .summary .time {
    font-size: 12px;
    color: #6c7086;
  }

  .detection-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 300px;
    overflow-y: auto;
  }

  .detection-item {
    background: #313244;
    border-radius: 8px;
    padding: 10px 12px;
  }

  .det-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .category {
    font-weight: 600;
    font-size: 13px;
  }

  .badge {
    background: #f38ba8;
    color: #1e1e2e;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    text-transform: uppercase;
  }

  .confidence {
    margin-left: auto;
    font-size: 12px;
    color: #6c7086;
  }

  .explanation {
    font-size: 12px;
    color: #a6adc8;
    margin: 6px 0 0;
    line-height: 1.4;
  }

  footer {
    border-top: 1px solid #45475a;
    padding-top: 8px;
  }

  .url {
    font-size: 11px;
    color: #6c7086;
  }
</style>
