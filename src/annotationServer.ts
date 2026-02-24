import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";

function parseIntWithDefault(value: string | undefined, defaultValue: number): number {
  const parsed = parseInt(value ?? "", 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

// --- Types ---

export interface AnnotationElement {
  selector: string;
  selectorConfidence: "stable" | "fragile";
  reactSource: { component: string; source?: string } | null;
  elementRect: { x: number; y: number; width: number; height: number };
}

export interface Annotation {
  id: string;
  url: string;
  selector: string;
  selectorConfidence: "stable" | "fragile";
  text: string;
  status: "open" | "resolved";
  viewport: { width: number; height: number };
  reactSource: { component: string; source?: string } | null;
  screenshot: string | null;
  elements?: AnnotationElement[];
  anchorPoint?: { x: number; y: number };
  createdAt: string;
  updatedAt: string;
}

// --- Helpers ---

export function isAllowedOrigin(origin: string | undefined): string | null {
  if (!origin) return null;
  try {
    const parsed = new URL(origin);
    if (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]")
    ) {
      return origin;
    }
  } catch {
    /* invalid URL */
  }
  return null;
}

function corsHeaders(req?: IncomingMessage): Record<string, string> {
  const origin = req?.headers.origin;
  const allowed = isAllowedOrigin(origin) ?? "http://127.0.0.1";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function jsonResponse(res: ServerResponse, status: number, body: unknown, req?: IncomingMessage): void {
  const data = JSON.stringify(body);
  res.writeHead(status, { ...corsHeaders(req), "Content-Type": "application/json" });
  res.end(data);
}

const MAX_ANNOTATIONS = 50;
const MAX_BODY_BYTES = 64 * 1024; // 64KB
const MAX_TEXT_LENGTH = 10 * 1024; // 10KB
const MAX_SELECTOR_LENGTH = 2048;
const MAX_VIEWPORT_DIM = 100_000;
const MAX_SCREENSHOT_BYTES = 20 * 1024 * 1024; // 20MB

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// --- Port file ---

export interface PortFileData {
  port: number;
  pid: number;
  startedAt: string;
}

function getPortFilePath(): string {
  return process.env.ANNOKU_PORT_FILE || `${tmpdir()}/.annoku.port`;
}

function writePortFile(port: number): void {
  const data: PortFileData = { port, pid: process.pid, startedAt: new Date().toISOString() };
  writeFileSync(getPortFilePath(), JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
}

function deletePortFile(): void {
  try {
    unlinkSync(getPortFilePath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

/**
 * Read the port file written by a running AnnotationServer.
 * Returns null if the file does not exist or cannot be parsed.
 */
export function readPortFile(): PortFileData | null {
  try {
    const raw = readFileSync(getPortFilePath(), "utf8");
    return JSON.parse(raw) as PortFileData;
  } catch {
    return null;
  }
}

// --- Annotation Server ---

export type ScreenshotCallback = (rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}) => Promise<string | null>;

export interface StartOptions {
  persist?: boolean;
}

const PERSIST_DEBOUNCE_MS = 300;

function getPersistFilePath(): string {
  return process.env.ANNOKU_PERSIST_FILE || `${tmpdir()}/.annoku-annotations.json`;
}

export class AnnotationServer {
  private server: ReturnType<typeof createServer> | null = null;
  private port: number | null = null;
  private annotations = new Map<string, Annotation>();
  private screenshotCallback: ScreenshotCallback | null = null;
  private persistEnabled = false;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private overlayScriptBuilder: ((port: number) => string) | null = null;

  /**
   * Register a callback to capture element screenshots via CDP.
   */
  onScreenshot(cb: ScreenshotCallback): void {
    this.screenshotCallback = cb;
  }

  /**
   * Register the overlay script builder so the server can serve it via GET /overlay.js.
   */
  onOverlayScript(builder: (port: number) => string): void {
    this.overlayScriptBuilder = builder;
  }

  private loadPersistedAnnotations(): void {
    try {
      const raw = readFileSync(getPersistFilePath(), "utf8");
      const arr = JSON.parse(raw) as Annotation[];
      for (const ann of arr) {
        this.annotations.set(ann.id, ann);
      }
    } catch {
      // File doesn't exist or is invalid — start fresh
    }
  }

  private schedulePersist(): void {
    if (!this.persistEnabled) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      this.flushPersist();
    }, PERSIST_DEBOUNCE_MS);
  }

  private flushPersist(): void {
    if (!this.persistEnabled) return;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    const data = Array.from(this.annotations.values());
    writeFileSync(getPersistFilePath(), JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
  }

  async start(options?: StartOptions): Promise<number> {
    if (this.server) {
      return this.port!;
    }

    this.persistEnabled = !!(options?.persist || process.env.ANNOKU_PERSIST === "1");
    if (this.persistEnabled) {
      this.loadPersistedAnnotations();
    }

    const basePort = parseIntWithDefault(process.env.ANNOTATION_PORT, 9223);
    const portsToTry = [basePort, basePort + 1, basePort + 2, basePort + 3];

    for (const port of portsToTry) {
      try {
        await this.listen(port);
        this.port = port;
        writePortFile(port);
        console.error(`[annoku] Annotation server listening on port ${port}`);
        return port;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code === "EADDRINUSE") {
          console.error(`[annoku] Port ${port} in use, trying next...`);
          continue;
        }
        throw err;
      }
    }

    throw new Error(`Could not bind annotation server on ports ${portsToTry.join(", ")}`);
  }

  private listen(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const srv = createServer((req, res) => this.handleRequest(req, res));
      srv.once("error", reject);
      srv.listen(port, "127.0.0.1", () => {
        srv.removeListener("error", reject);
        this.server = srv;
        resolve();
      });
    });
  }

  getPort(): number | null {
    return this.port;
  }

  getAnnotations(): Annotation[] {
    return Array.from(this.annotations.values());
  }

  getAnnotation(id: string): Annotation | undefined {
    return this.annotations.get(id);
  }

  resolveAnnotation(id: string): Annotation | undefined {
    const ann = this.annotations.get(id);
    if (!ann) return undefined;
    ann.status = "resolved";
    ann.updatedAt = new Date().toISOString();
    this.schedulePersist();
    return ann;
  }

  deleteAnnotation(id: string): boolean {
    const deleted = this.annotations.delete(id);
    if (deleted) this.schedulePersist();
    return deleted;
  }

  clearAnnotations(): number {
    const count = this.annotations.size;
    this.annotations.clear();
    if (count > 0) this.schedulePersist();
    return count;
  }

  async shutdown(): Promise<void> {
    if (!this.server) return;
    this.flushPersist();
    return new Promise((resolve) => {
      this.server!.close(() => {
        deletePortFile();
        console.error("[annoku] Annotation server stopped.");
        this.server = null;
        this.port = null;
        resolve();
      });
    });
  }

  // --- HTTP Request Handler ---

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:${this.port}`);
      const method = req.method ?? "GET";
      const path = url.pathname;

      // CORS preflight
      if (method === "OPTIONS") {
        res.writeHead(204, corsHeaders(req));
        res.end();
        return;
      }

      // Health check
      if (method === "GET" && path === "/") {
        jsonResponse(
          res,
          200,
          {
            status: "ok",
            count: this.annotations.size,
            port: this.port,
          },
          req,
        );
        return;
      }

      // GET /overlay.js — serve the overlay IIFE for browser injection
      if (method === "GET" && path === "/overlay.js") {
        if (!this.overlayScriptBuilder || !this.port) {
          jsonResponse(res, 503, { error: "Overlay script not available" }, req);
          return;
        }
        const script = this.overlayScriptBuilder(this.port);
        res.writeHead(200, {
          ...corsHeaders(req),
          "Content-Type": "application/javascript",
        });
        res.end(script);
        return;
      }

      // POST /annotations — create
      if (method === "POST" && path === "/annotations") {
        if (this.annotations.size >= MAX_ANNOTATIONS) {
          jsonResponse(
            res,
            429,
            {
              error: `Maximum of ${MAX_ANNOTATIONS} annotations reached. Resolve or delete existing annotations first.`,
            },
            req,
          );
          return;
        }

        const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
        const now = new Date().toISOString();

        // Input validation
        const text = String(body.text ?? "");
        if (text.length > MAX_TEXT_LENGTH) {
          jsonResponse(res, 400, { error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` }, req);
          return;
        }
        if (typeof body.url !== "undefined" && typeof body.url !== "string") {
          jsonResponse(res, 400, { error: "url must be a string" }, req);
          return;
        }

        const selector = String(body.selector ?? "");
        if (selector.length > MAX_SELECTOR_LENGTH) {
          jsonResponse(
            res,
            400,
            { error: `Selector exceeds maximum length of ${MAX_SELECTOR_LENGTH} characters` },
            req,
          );
          return;
        }
        if (Array.isArray(body.elements)) {
          for (const el of body.elements as Record<string, unknown>[]) {
            if (String(el.selector ?? "").length > MAX_SELECTOR_LENGTH) {
              jsonResponse(
                res,
                400,
                { error: `Element selector exceeds maximum length of ${MAX_SELECTOR_LENGTH} characters` },
                req,
              );
              return;
            }
          }
        }

        const viewport = body.viewport as { width?: number; height?: number } | undefined;
        const vw = Number(viewport?.width ?? 0);
        const vh = Number(viewport?.height ?? 0);
        if (
          !Number.isFinite(vw) ||
          !Number.isFinite(vh) ||
          vw < 0 ||
          vh < 0 ||
          vw > MAX_VIEWPORT_DIM ||
          vh > MAX_VIEWPORT_DIM
        ) {
          jsonResponse(res, 400, { error: "Invalid viewport dimensions" }, req);
          return;
        }

        const reactSource = body.reactSource as { component?: string; source?: string } | undefined;
        const elementRect = body.elementRect as { x?: number; y?: number; width?: number; height?: number } | undefined;

        // Capture screenshot via CDP if we have a valid rect and a callback
        let screenshot: string | null = null;
        if (
          elementRect &&
          this.screenshotCallback &&
          Number(elementRect.width ?? 0) > 0 &&
          Number(elementRect.height ?? 0) > 0
        ) {
          try {
            const result = await this.screenshotCallback({
              x: Number(elementRect.x ?? 0),
              y: Number(elementRect.y ?? 0),
              width: Number(elementRect.width ?? 0),
              height: Number(elementRect.height ?? 0),
            });
            if (result && result.length > MAX_SCREENSHOT_BYTES) {
              console.error(`[annoku] Screenshot too large (${result.length} bytes), discarding`);
            } else {
              screenshot = result;
            }
          } catch (err) {
            console.error(`[annoku] Screenshot capture failed: ${err instanceof Error ? err.message : err}`);
          }
        }

        const annotation: Annotation = {
          id: randomUUID(),
          url: String(body.url ?? ""),
          selector,
          selectorConfidence: body.selectorConfidence === "stable" ? "stable" : "fragile",
          text,
          status: "open",
          viewport: { width: vw, height: vh },
          reactSource: reactSource?.component
            ? {
                component: String(reactSource.component),
                source: reactSource.source ? String(reactSource.source) : undefined,
              }
            : null,
          screenshot,
          createdAt: now,
          updatedAt: now,
        };

        // Multi-element annotations (drag-select)
        if (Array.isArray(body.elements)) {
          annotation.elements = (body.elements as Record<string, unknown>[]).map((el) => {
            const elRect = el.elementRect as { x?: number; y?: number; width?: number; height?: number } | undefined;
            const elReact = el.reactSource as { component?: string; source?: string } | undefined;
            return {
              selector: String(el.selector ?? ""),
              selectorConfidence: el.selectorConfidence === "stable" ? "stable" : ("fragile" as const),
              reactSource: elReact?.component
                ? { component: String(elReact.component), source: elReact.source ? String(elReact.source) : undefined }
                : null,
              elementRect: {
                x: Number(elRect?.x ?? 0),
                y: Number(elRect?.y ?? 0),
                width: Number(elRect?.width ?? 0),
                height: Number(elRect?.height ?? 0),
              },
            };
          });
        }

        const anchorPt = body.anchorPoint as { x?: number; y?: number } | undefined;
        if (anchorPt && anchorPt.x != null && anchorPt.y != null) {
          annotation.anchorPoint = { x: Number(anchorPt.x), y: Number(anchorPt.y) };
        }

        this.annotations.set(annotation.id, annotation);
        this.schedulePersist();
        jsonResponse(res, 201, { id: annotation.id }, req);
        return;
      }

      // DELETE /annotations — bulk delete all
      if (method === "DELETE" && path === "/annotations") {
        const deleted = this.clearAnnotations();
        jsonResponse(res, 200, { success: true, deleted }, req);
        return;
      }

      // GET /annotations — list all
      if (method === "GET" && path === "/annotations") {
        jsonResponse(res, 200, Array.from(this.annotations.values()), req);
        return;
      }

      // Routes with :id
      const idMatch = path.match(/^\/annotations\/([^/]+)(\/resolve)?$/);
      if (idMatch) {
        const id = idMatch[1];
        const isResolve = idMatch[2] === "/resolve";

        // POST /annotations/:id/resolve
        if (method === "POST" && isResolve) {
          const ann = this.resolveAnnotation(id);
          if (!ann) {
            jsonResponse(res, 404, { error: "Annotation not found" }, req);
            return;
          }
          jsonResponse(res, 200, ann, req);
          return;
        }

        // PATCH /annotations/:id — update text
        if (method === "PATCH" && !isResolve) {
          const ann = this.annotations.get(id);
          if (!ann) {
            jsonResponse(res, 404, { error: "Annotation not found" }, req);
            return;
          }
          const body = JSON.parse(await readBody(req)) as Record<string, unknown>;
          if (typeof body.text === "string") {
            if (body.text.length > MAX_TEXT_LENGTH) {
              jsonResponse(res, 400, { error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH} characters` }, req);
              return;
            }
            ann.text = body.text;
          }
          ann.updatedAt = new Date().toISOString();
          this.schedulePersist();
          jsonResponse(res, 200, ann, req);
          return;
        }

        // DELETE /annotations/:id
        if (method === "DELETE" && !isResolve) {
          const deleted = this.annotations.delete(id);
          if (!deleted) {
            jsonResponse(res, 404, { error: "Annotation not found" }, req);
            return;
          }
          this.schedulePersist();
          jsonResponse(res, 200, { success: true }, req);
          return;
        }
      }

      // 404
      jsonResponse(res, 404, { error: "Not found" }, req);
    } catch (err) {
      console.error("[annoku] Annotation server error:", err);
      jsonResponse(res, 500, { error: "Internal server error" }, req);
    }
  }
}

export const annotationServer = new AnnotationServer();

export function getAnnotationPort(): number | null {
  return annotationServer.getPort();
}
