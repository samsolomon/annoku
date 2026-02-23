#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { annotationServer, buildOverlayScript, getAnnotationPort } from "./index.js";

const server = new McpServer({
  name: "annoku",
  version: "0.1.0",
});

annotationServer.onSendNotify((count) => {
  server.sendLoggingMessage({
    level: "info",
    logger: "annoku-annotations",
    data: count > 0
      ? `User clicked Send with ${count} open annotation(s).`
      : "User clicked Send with no open annotations.",
  }).catch(() => {
    // Ignore notification errors when transport is disconnected.
  });
});

server.tool(
  "start_annotation_server",
  "Start the local annotation HTTP server (idempotent).",
  {},
  async () => {
    const port = await annotationServer.start();
    return {
      content: [{ type: "text", text: JSON.stringify({ started: true, port }, null, 2) }],
    };
  },
);

server.tool(
  "stop_annotation_server",
  "Stop the local annotation HTTP server.",
  {},
  async () => {
    await annotationServer.shutdown();
    return {
      content: [{ type: "text", text: JSON.stringify({ stopped: true }, null, 2) }],
    };
  },
);

server.tool(
  "get_annotation_port",
  "Get the current annotation server port, or null if not running.",
  {},
  async () => {
    return {
      content: [{ type: "text", text: JSON.stringify({ port: getAnnotationPort() }, null, 2) }],
    };
  },
);

server.tool(
  "build_overlay_script",
  "Generate browser-injected overlay script string for the annotation server port.",
  {
    port: z.number().int().min(1).max(65535).optional().describe("Optional port override"),
  },
  async ({ port }) => {
    const resolvedPort = port ?? getAnnotationPort() ?? await annotationServer.start();
    const script = buildOverlayScript(resolvedPort);
    return {
      content: [{ type: "text", text: script }],
    };
  },
);

server.tool(
  "list_annotations",
  "List annotations currently stored in the local annotation server.",
  {},
  async () => {
    return {
      content: [{ type: "text", text: JSON.stringify(annotationServer.getAnnotations(), null, 2) }],
    };
  },
);

server.tool(
  "resolve_annotation",
  "Resolve an annotation by id.",
  {
    id: z.string().min(1).describe("Annotation ID"),
  },
  async ({ id }) => {
    const resolved = annotationServer.resolveAnnotation(id);
    if (!resolved) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Annotation not found", id }, null, 2) }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(resolved, null, 2) }],
    };
  },
);

server.tool(
  "delete_annotation",
  "Delete an annotation by id.",
  {
    id: z.string().min(1).describe("Annotation ID"),
  },
  async ({ id }) => {
    const deleted = annotationServer.deleteAnnotation(id);
    if (!deleted) {
      return {
        content: [{ type: "text", text: JSON.stringify({ error: "Annotation not found", id }, null, 2) }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, id }, null, 2) }],
    };
  },
);

server.tool(
  "clear_annotations",
  "Clear all annotations from the server.",
  {},
  async () => {
    const deleted = annotationServer.clearAnnotations();
    return {
      content: [{ type: "text", text: JSON.stringify({ success: true, deleted }, null, 2) }],
    };
  },
);

server.tool(
  "wait_for_send",
  "Long-poll until user clicks Send in the overlay, then return open annotations.",
  {
    timeout: z.number().int().min(1).max(600).default(300).describe("Timeout in seconds"),
  },
  async ({ timeout }) => {
    if (getAnnotationPort() === null) {
      await annotationServer.start();
    }
    const result = await annotationServer.waitForSend(timeout * 1000);
    if (!result.triggered) {
      return {
        content: [{ type: "text", text: JSON.stringify({ sent: false, count: 0, annotations: [] }, null, 2) }],
      };
    }
    const open = annotationServer.getAnnotations().filter((a) => a.status === "open");
    return {
      content: [{ type: "text", text: JSON.stringify({ sent: true, count: open.length, annotations: open }, null, 2) }],
    };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error("[annoku] MCP server running on stdio");

const shutdown = async () => {
  await annotationServer.shutdown();
  process.exit(0);
};

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
