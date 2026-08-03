// Proxy to asktorii.com/mcp (used by AskToriiChat) — injects the streamable-HTTP
// Accept header the MCP server requires and bypasses browser CORS.

export const runtime = "nodejs";

const UPSTREAM = "https://asktorii.com/mcp";

export async function POST(req: Request) {
  const body = await req.text();
  const upstream = await fetch(UPSTREAM, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body,
  });
  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/json",
    },
  });
}
