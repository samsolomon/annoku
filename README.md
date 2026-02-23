# relay-annotations

Standalone browser annotation overlay and HTTP annotation server.

## Project status

This repository contains the annotation functionality that was extracted from
`/relay-inspect` so it can be reused by other MCP servers and tooling.

Originally embedded in `relay-inspect/src/annotationOverlay.ts` and
`relay-inspect/src/annotationServer.ts`, it is now maintained as a standalone
package with no CDP or MCP-specific runtime dependencies.

## Exports

```ts
// Core
export { buildOverlayScript } from "./annotationOverlay.js";
export { AnnotationServer, annotationServer, getAnnotationPort } from "./annotationServer.js";

// Types
export type { Annotation, AnnotationElement, ScreenshotCallback } from "./annotationServer.js";

// Utility
export { isAllowedOrigin } from "./annotationServer.js";
```

## Usage

```ts
import { annotationServer, buildOverlayScript } from "relay-annotations";

annotationServer.onScreenshot(async (rect) => {
  // consumer-owned screenshot implementation
  return null;
});

annotationServer.onSendNotify((count) => {
  // consumer-owned send notification
  console.log("send clicked", count);
});

const port = await annotationServer.start();
const script = buildOverlayScript(port);
```

## Development

- `npm run build`
- `npm test`
