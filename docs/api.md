# API Reference

> DarkGuard exposes a single REST endpoint for running dark pattern analysis.

## Base URL

```
http://localhost:8000/api
```

## Authentication

None required (stateless analysis). CORS is locked to:
- `chrome-extension://*` (any Chrome extension)
- `http://localhost:8000`
- `http://127.0.0.1:8000`
- `http://localhost:3000`

---

## `POST /api/analyze`

Run all four dark-pattern analyzers on a webpage payload.

### Request

**Content-Type**: `application/json`

```json
{
  "url": "https://example.com/product",
  "dom_metadata": {
    "hidden_elements": [
      {
        "selector": ".sneaky-checkbox",
        "tag_name": "div",
        "text_content": "Sign me up for newsletters",
        "attributes": { "style": "display:none" },
        "bounding_rect": { "x": 0, "y": 0, "width": 0, "height": 0 },
        "computed_styles": {
          "color": "#ccc",
          "background_color": "#fff",
          "font_size": "10px",
          "opacity": "0.1",
          "display": "none",
          "visibility": "hidden"
        }
      }
    ],
    "interactive_elements": [
      {
        "selector": "#accept-btn",
        "tag_name": "button",
        "text_content": "Accept All Cookies",
        "attributes": { "class": "big-green-btn" },
        "bounding_rect": { "x": 100, "y": 400, "width": 300, "height": 60 },
        "computed_styles": {
          "color": "white",
          "background_color": "green",
          "font_size": "18px",
          "opacity": "1",
          "display": "block",
          "visibility": "visible"
        }
      },
      {
        "selector": "#decline-link",
        "tag_name": "a",
        "text_content": "No thanks, I don't want to save money",
        "attributes": { "href": "#" },
        "bounding_rect": { "x": 420, "y": 420, "width": 80, "height": 14 },
        "computed_styles": {
          "color": "#999",
          "background_color": "transparent",
          "font_size": "10px",
          "opacity": "0.6",
          "display": "inline",
          "visibility": "visible"
        }
      }
    ],
    "prechecked_inputs": [
      {
        "selector": "#newsletter-optin",
        "tag_name": "input",
        "text_content": "",
        "attributes": { "type": "checkbox", "checked": "" },
        "bounding_rect": { "x": 50, "y": 600, "width": 16, "height": 16 },
        "computed_styles": {
          "color": "black",
          "background_color": "white",
          "font_size": "14px",
          "opacity": "1",
          "display": "inline",
          "visibility": "visible"
        }
      }
    ]
  },
  "text_content": {
    "button_labels": [
      { "selector": "#accept-btn", "text": "Accept All Cookies" },
      { "selector": "#decline-link", "text": "No thanks, I don't want to save money" }
    ],
    "headings": [
      { "selector": "h1", "text": "Flash Sale — Ends Today!" }
    ],
    "body_text": "Only 3 left in stock! Don't miss this deal. 47 people are viewing this right now..."
  },
  "screenshot_b64": "data:image/png;base64,iVBORw0KGgo...",
  "review_text": "Amazing product!---Great item! Highly recommend!---Must buy! Five stars!"
}
```

### Request Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `url` | `string` | ✅ | Full URL of the page being analyzed |
| `dom_metadata` | `object` | ✅ | DOM structure data |
| `dom_metadata.hidden_elements` | `array` | ✅ | Elements hidden via CSS |
| `dom_metadata.interactive_elements` | `array` | ✅ | Buttons, links, submit inputs |
| `dom_metadata.prechecked_inputs` | `array` | ✅ | Pre-checked checkboxes/radios |
| `text_content` | `object` | ✅ | Visible text signals |
| `text_content.button_labels` | `array` | ✅ | `{selector, text}` for each button |
| `text_content.headings` | `array` | ✅ | `{selector, text}` for each heading |
| `text_content.body_text` | `string` | ✅ | Truncated body text (≤ 5000 chars) |
| `screenshot_b64` | `string` | ❌ | Base64-encoded PNG screenshot |
| `review_text` | `string \| null` | ❌ | Review texts separated by `---` |

### Response

**Status**: `200 OK`

```json
{
  "detections": [
    {
      "category": "preselection",
      "element_selector": "#newsletter-optin",
      "confidence": 0.85,
      "explanation": "This checkbox/radio is pre-selected, which may trick users into opting in unintentionally.",
      "severity": "medium",
      "corroborated": false,
      "user_feedback": null
    },
    {
      "category": "visual_interference",
      "element_selector": "#decline-link",
      "confidence": 0.92,
      "explanation": "This button is 16.1× smaller than a nearby button, making it easy to overlook.",
      "severity": "high",
      "corroborated": true,
      "user_feedback": null
    },
    {
      "category": "confirmshaming",
      "element_selector": "#decline-link",
      "confidence": 0.85,
      "explanation": "The decline option uses guilt-tripping language: \"No thanks, I don't want to save money\"",
      "severity": "medium",
      "corroborated": true,
      "user_feedback": null
    },
    {
      "category": "urgency_scarcity",
      "element_selector": "body",
      "confidence": 0.70,
      "explanation": "Urgency/scarcity language detected: \"…Only 3 left in stock!…\"",
      "severity": "low",
      "corroborated": false,
      "user_feedback": null
    }
  ]
}
```

### Response Fields

| Field | Type | Description |
|---|---|---|
| `detections` | `array` | List of detected dark patterns |
| `detections[].category` | `string` | One of: `preselection`, `visual_interference`, `confirmshaming`, `urgency_scarcity`, `misdirection`, `fake_social_proof`, `hidden_costs` |
| `detections[].element_selector` | `string` | CSS selector of the flagged element |
| `detections[].confidence` | `float` | Confidence score `0.0 – 1.0` |
| `detections[].explanation` | `string` | Human-readable explanation |
| `detections[].severity` | `string` | `"low"`, `"medium"`, or `"high"` |
| `detections[].corroborated` | `boolean` | `true` if 2+ analyzers flagged the same (selector, category) |
| `detections[].user_feedback` | `string \| null` | Reserved for future user feedback loop |

### Error Responses

| Status | Body | Cause |
|---|---|---|
| `400` | `{"url": ["This field is required."]}` | Missing required fields |
| `400` | `{"dom_metadata": ["This field is required."]}` | Invalid payload shape |
| `500` | `{"detail": "Internal server error"}` | Analyzer crash (gracefully degraded) |

### Timeout Behavior

Each analyzer has a **10-second timeout** (`ANALYZER_TIMEOUT` env var). If an analyzer exceeds this:
- It is cancelled via `asyncio.wait_for()`
- A warning is logged
- Other analyzers' results are still returned
- The response is partial but valid
