# AGENTS.md

## What this is
Annoku — a standalone MCP server that provides a browser annotation overlay. An AI agent starts a local HTTP server, injects a JS overlay into the browser, and users can pin annotations on the page. The agent can then read, resolve, or clear those annotations via MCP tools.

## Project structure
- `src/index.ts` — public API barrel (re-exports from server + overlay)
- `src/mcp.ts` — MCP server entry point (stdio transport, registers all tools)
- `src/annotationServer.ts` — HTTP annotation server (singleton, manages annotation state)
- `src/annotationOverlay.ts` — generates the browser-injected JS overlay script
- `src/annotation-server.test.ts` — tests

## Stack
- TypeScript (strict), ESM-only, target Node 20+
- `tsup` for bundling (two entry points: `index.ts`, `mcp.ts`)
- `vitest` for tests
- `@modelcontextprotocol/sdk` + `zod` v4 as runtime dependencies
- `npm` as package manager (`package-lock.json`)

## Commands
```
npm run build        # tsup bundle
npm test             # vitest run
npm run dev          # tsx src/mcp.ts (stdio MCP server)
```

Run a single test:
```
npx vitest src/annotation-server.test.ts
npx vitest src/annotation-server.test.ts -t "test name"
```

## Conventions
- Tool handlers in `mcp.ts` return `{ content: [{ type: "text", text: JSON.stringify(...) }] }`.
- The annotation server is a singleton (`annotationServer`) — don't instantiate additional instances.
- Imports use `.js` extensions (required for ESM + bundler resolution).
