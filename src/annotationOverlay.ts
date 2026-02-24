/**
 * Builds a self-contained IIFE string for injection into the browser via Runtime.evaluate.
 * Targets ES2017 (V8). No imports, no external dependencies.
 * All DOM created via document.createElement (never innerHTML with user content).
 *
 * The IIFE source lives in src/overlay.iife.js for full editor/linting support.
 * A prebuild step (scripts/inline-overlay.mjs) inlines it as a TS string constant.
 */
import { OVERLAY_IIFE } from "./_overlay.generated.js";

export function buildOverlayScript(port: number): string {
  return OVERLAY_IIFE.replace("__PORT__", String(port));
}
