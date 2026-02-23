# annoku

Standalone browser annotation overlay and HTTP annotation server.

![Relay Inspect annotation overlay](assets/hero.png)

## Project status

This repository contains the annotation functionality that was extracted from
`/relay-inspect` so it can be reused by other MCP servers and tooling.

Originally embedded in `relay-inspect/src/annotationOverlay.ts` and
`relay-inspect/src/annotationServer.ts`, it is now maintained as a standalone
package with no CDP or MCP-specific runtime dependencies.

## What this package provides

- Browser overlay script generation (`buildOverlayScript(port)`)
- Local HTTP annotation server with CRUD endpoints
- Screenshot callback hook (`onScreenshot`) implemented by the consumer
- Send-notification callback hook (`onSendNotify`) implemented by the consumer
- Long-poll support for "Send to AI" (`waitForSend`)

The package intentionally has no CDP or MCP knowledge. Consumers provide those
integrations from their own runtime.

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

## Typical workflow

1. Consumer starts `AnnotationServer`
2. Consumer injects `buildOverlayScript(port)` into the browser page
3. User creates visual annotations in the overlay
4. Overlay sends annotation data to local server endpoints
5. Consumer receives send events via `waitForSend` and processes them

Each annotation can include:

- Screenshot of the annotated element
- Selector and selector confidence
- Optional React component/source metadata
- Viewport info and freeform feedback text

## Development

- `npm run build`
- `npm test`
