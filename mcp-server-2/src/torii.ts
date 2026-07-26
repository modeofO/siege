/**
 * Torii SQL helpers. This server reads Torii exclusively over the SQL
 * endpoint — the gRPC stream (and with it the @dojoengine/torii-client wasm
 * dependency) was removed when live updates moved to the watch-scoped poller
 * in live.ts; see that file for the measured rationale.
 */

function requireNonEmpty(value: string, label: string): string {
  if (!value.trim()) throw new Error(`${label} is required`);
  return value;
}

function normalizeToriiUrl(url: string): string {
  return url.replace(/\/graphql\/?$/, "").replace(/\/sql\/?$/, "").replace(/\/$/, "");
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export async function fetchModelNames(toriiUrl: string, namespace: string): Promise<string[]> {
  requireNonEmpty(namespace, "namespace");

  const query = `SELECT namespace, name FROM models WHERE namespace = ${sqlString(namespace)} ORDER BY name`;
  const resp = await fetch(`${normalizeToriiUrl(requireNonEmpty(toriiUrl, "toriiUrl"))}/sql?query=${encodeURIComponent(query)}`);
  if (!resp.ok) throw new Error(`Torii SQL failed: HTTP ${resp.status}`);

  const rows = (await resp.json()) as Array<Record<string, unknown>>;
  return rows
    .map((row) => `${String(row.namespace)}-${String(row.name)}`)
    .filter((name) => name.length > namespace.length + 1);
}
