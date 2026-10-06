import fs from "node:fs";
import path from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

// Lets `npm run dev` (and `npm run preview`) serve the api/*.ts Vercel
// serverless functions directly, without needing the Vercel CLI, a Vercel
// login, or a deployment - purely for local development. Production
// (`vercel deploy`) still runs these the real way, through Vercel itself;
// this plugin is never part of that path.
//
// Resolves a request path to a file under api/ using the same file-based
// routing convention Vercel uses: literal segments, `index.ts` for a
// directory's own route, and `[param]` directories/files for dynamic
// segments (e.g. api/admin/users/[id]/reset-device.ts).

interface RouteMatch {
  file: string;
  params: Record<string, string>;
}

function matchRoute(dir: string, segments: string[], params: Record<string, string>): RouteMatch | null {
  if (segments.length === 0) {
    const indexFile = path.join(dir, "index.ts");
    if (fs.existsSync(indexFile)) return { file: indexFile, params };
    return null;
  }

  const [first, ...rest] = segments;

  const literalDir = path.join(dir, first);
  if (fs.existsSync(literalDir) && fs.statSync(literalDir).isDirectory()) {
    const result = matchRoute(literalDir, rest, params);
    if (result) return result;
  }

  if (rest.length === 0) {
    const literalFile = path.join(dir, `${first}.ts`);
    if (fs.existsSync(literalFile)) return { file: literalFile, params };
  }

  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && entry.name.startsWith("[") && entry.name.endsWith("]")) {
      const paramName = entry.name.slice(1, -1);
      const result = matchRoute(path.join(dir, entry.name), rest, { ...params, [paramName]: first });
      if (result) return result;
    }
    if (rest.length === 0 && entry.isFile() && entry.name.startsWith("[") && entry.name.endsWith("].ts")) {
      const paramName = entry.name.slice(1, -4);
      return { file: path.join(dir, entry.name), params: { ...params, [paramName]: first } };
    }
  }

  return null;
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function withVercelResponseShape(res: ServerResponse) {
  const shaped = res as ServerResponse & {
    status: (code: number) => typeof shaped;
    json: (body: unknown) => void;
  };
  shaped.status = (code: number) => {
    shaped.statusCode = code;
    return shaped;
  };
  shaped.json = (body: unknown) => {
    shaped.setHeader("Content-Type", "application/json");
    shaped.end(JSON.stringify(body));
  };
  return shaped;
}

function createApiMiddleware(apiDir: string, loadModule: (file: string) => Promise<{ default: Function }>) {
  return async function apiMiddleware(req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith("/api/")) {
      next();
      return;
    }

    const segments = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
    const match = matchRoute(apiDir, segments, {});
    if (!match) {
      next();
      return;
    }

    try {
      const body = await readJsonBody(req);
      const query: Record<string, string> = { ...Object.fromEntries(url.searchParams), ...match.params };
      Object.assign(req, { body, query });

      const mod = await loadModule(match.file);
      const vercelRes = withVercelResponseShape(res);
      await mod.default(req, vercelRes);
    } catch (err) {
      console.error(`[api-dev] Error handling ${req.method} ${url.pathname}:`, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Internal server error" }));
      }
    }
  };
}

export default function apiDevPlugin(): Plugin {
  const apiDir = path.resolve(__dirname, "api");

  return {
    name: "api-dev",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(createApiMiddleware(apiDir, (file) => server.ssrLoadModule(file)));
    },
  };
}
