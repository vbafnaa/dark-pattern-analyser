// ──────────────────────────────────────────────
// DarkGuard — Content script entry point
// Barrel file that imports both collector and overlay modules
// so they are bundled into a single content.js output.
// ──────────────────────────────────────────────

import "./collector";
import "./overlay";
