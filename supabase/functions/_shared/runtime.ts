// Deno wiring for the handlers: real Supabase clients, CORS and error handling.
// Secrets (service key etc.) come from the function's environment - Supabase injects
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY. Nothing is hard-coded.
import { createClient } from "npm:@supabase/supabase-js@2";
import type { DbClient, Deps, Req, Res } from "./handlers.ts";

const url = () => Deno.env.get("SUPABASE_URL")!;
const serviceKey = () => Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = () => (Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY"))!;
const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function realDeps(): Deps {
  return {
    svc: createClient(url(), serviceKey(), clientOptions) as unknown as DbClient,
    anon: () => createClient(url(), anonKey(), clientOptions) as unknown as DbClient,
    asUser: (token: string) =>
      createClient(url(), anonKey(), {
        ...clientOptions,
        global: { headers: { Authorization: `Bearer ${token}` } },
      }) as unknown as DbClient,
    newId: () => crypto.randomUUID(),
  };
}

// Only the app's own origins may call these functions from a browser.
const allowedOrigins = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://crown-pvt-ltd.vercel.app,http://localhost:3000")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
  if (origin && allowedOrigins.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function serve(handler: (req: Req, deps: Deps) => Promise<Res>) {
  Deno.serve(async (request: Request) => {
    const headers = corsHeaders(request.headers.get("origin"));
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
    }
    try {
      const res = await handler(request, realDeps());
      return new Response(JSON.stringify(res.body), { status: res.status, headers });
    } catch (e) {
      console.error("function error:", e instanceof Error ? e.message : "unknown"); // never log request bodies
      return new Response(JSON.stringify({ error: "Something went wrong" }), { status: 500, headers });
    }
  });
}
