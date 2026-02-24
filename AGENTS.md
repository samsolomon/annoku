# AGENTS.md

## What this is

Annoku — a standalone MCP server that provides a browser annotation overlay. An AI agent starts a local HTTP server, injects a JS overlay into the browser, and users can pin annotations on the page. The agent can then read, resolve, or clear those annotations via MCP tools.

## Architecture (3 layers)

```
overlay.iife.js  →  annotationServer.ts  →  mcp.ts
(browser DOM)       (HTTP server)           (MCP stdio transport)
```

1. **Overlay** (`src/overlay.iife.js`) — self-contained ES2017 IIFE injected into the browser via `Runtime.evaluate`. Communicates with the annotation server over HTTP (`fetch` to `127.0.0.1`).
2. **HTTP server** (`src/annotationServer.ts`) — `node:http` server on localhost. CRUD for annotations, screenshot callback. No MCP or CDP knowledge.
3. **MCP server** (`src/mcp.ts`) — stdio transport, registers tools that delegate to the annotation server and overlay script builder.

`src/index.ts` is the public API barrel — re-exports from server + overlay.

## Build system

The overlay IIFE lives in a real `.js` file (`src/overlay.iife.js`) for full editor/linting support. A prebuild step inlines it into a generated TS module:

```
src/overlay.iife.js  →  scripts/inline-overlay.mjs  →  src/_overlay.generated.ts
```

`_overlay.generated.ts` is gitignored and regenerated on every build/test/dev run. `annotationOverlay.ts` imports the generated string and replaces `__PORT__` with the actual port number.

`tsup` bundles two entry points (`index.ts`, `mcp.ts`) targeting Node 20+ ESM.

## Commands

```
npm run build        # prebuild + tsup bundle
npm test             # prebuild + vitest run
npm run dev          # prebuild + tsx src/mcp.ts (stdio MCP server)
npm run lint         # eslint
npm run lint:fix     # eslint --fix
npm run format       # prettier --write
npm run format:check # prettier --check
```

Run a single test:

```
npx vitest src/annotation-server.test.ts
npx vitest src/annotation-server.test.ts -t "test name"
```

## Stack

- TypeScript (strict), ESM-only, target Node 20+
- `tsup` for bundling
- `vitest` for tests
- `eslint` (flat config) + `prettier` for linting/formatting
- `@modelcontextprotocol/sdk` + `zod` v4 as runtime dependencies
- `npm` as package manager (`package-lock.json`)

## Key constants

| Constant               | Value   | Location              |
| ---------------------- | ------- | --------------------- |
| `MAX_ANNOTATIONS`      | 50      | `annotationServer.ts` |
| `MAX_BODY_BYTES`       | 64 KB   | `annotationServer.ts` |
| `MAX_TEXT_LENGTH`      | 10 KB   | `annotationServer.ts` |
| `MAX_SELECTOR_LENGTH`  | 2048    | `annotationServer.ts` |
| `MAX_VIEWPORT_DIM`     | 100,000 | `annotationServer.ts` |
| `MAX_SCREENSHOT_BYTES` | 20 MB   | `annotationServer.ts` |
| `PERSIST_DEBOUNCE_MS`  | 300 ms  | `annotationServer.ts` |

## Patterns

### Adding an HTTP route

1. Add handler in `AnnotationServer.handleRequest()` (`annotationServer.ts`)
2. Follow existing pattern: check method + path, parse body with `readBody()`, validate, respond with `jsonResponse()`
3. If the route mutates annotations, call `this.schedulePersist()` after the mutation
4. Add tests in `annotation-server.test.ts` using a dedicated port via `process.env.ANNOTATION_PORT`

### Adding an MCP tool

1. Add `server.tool(name, description, schema, handler)` in `mcp.ts`
2. Handler returns `{ content: [{ type: "text", text: JSON.stringify(...) }] }`
3. Delegate to `annotationServer` methods — MCP tools are thin wrappers

### Port file and persistence

- Port file: written on `start()`, deleted on `shutdown()`. Location: `$ANNOKU_PORT_FILE` or `$TMPDIR/.annoku.port`
- Persistence: opt-in via `start({ persist: true })` or `ANNOKU_PERSIST=1`. Debounced writes, synchronous flush on shutdown.
- Use `readPortFile()` to discover the running server's port from external tools.

## Overlay conventions

- **ES2017 only** — the IIFE runs in any V8 context (Chrome DevTools `Runtime.evaluate`). No optional chaining, no nullish coalescing, no `let`/`const`.
- **`var` throughout** — function-scoped, re-declaration is intentional in loops. ESLint `no-redeclare` is off for this file.
- **No modules** — everything is inside a single IIFE. No imports, no exports.
- **`__PORT__` placeholder** — replaced at runtime by `buildOverlayScript(port)`.
- **DOM-only** — all UI created via `document.createElement`. Never use `innerHTML` with user content.

## Conventions

- Tool handlers in `mcp.ts` return `{ content: [{ type: "text", text: JSON.stringify(...) }] }`.
- Imports use `.js` extensions (required for ESM + bundler resolution).
- Tests use unique ports per `describe` block to avoid conflicts (set via `process.env.ANNOTATION_PORT` in `beforeAll`).
- Generated files (`src/_overlay.generated.ts`) must not be committed.
