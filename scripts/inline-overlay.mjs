#!/usr/bin/env node

/**
 * Reads src/overlay.iife.js and writes src/_overlay.generated.ts
 * exporting the IIFE source as a string constant.
 *
 * Run via: node scripts/inline-overlay.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const iife = readFileSync(resolve(root, "src/overlay.iife.js"), "utf8");

const output = `// AUTO-GENERATED — do not edit. Source: src/overlay.iife.js
// Regenerate with: node scripts/inline-overlay.mjs
export const OVERLAY_IIFE = ${JSON.stringify(iife)};\n`;

writeFileSync(resolve(root, "src/_overlay.generated.ts"), output);
console.error("[inline-overlay] wrote src/_overlay.generated.ts");
