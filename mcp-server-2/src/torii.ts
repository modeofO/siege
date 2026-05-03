import {
  ToriiClient,
  type Clause,
  type Entity,
  type Query,
  type Subscription,
} from "@dojoengine/torii-client";

export type { Clause, Entity, KeysClause, Model, Subscription, Ty } from "@dojoengine/torii-client";
export type ToriiClientInstance = ToriiClient;

const DEFAULT_ENTITY_LIMIT = 1000;

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

function entityPayloads(payload: unknown): unknown[] {
  if (payload && typeof payload === "object" && "error" in payload) {
    const err = (payload as { error?: unknown }).error;
    if (err) throw err instanceof Error ? err : new Error(String(err));
  }

  const data =
    payload && typeof payload === "object" && "data" in payload
      ? (payload as { data?: unknown }).data
      : payload;
  return Array.isArray(data) ? data : [data];
}

export async function createToriiClient(toriiUrl: string, worldAddress: string): Promise<ToriiClient> {
  const client = new ToriiClient({
    toriiUrl: normalizeToriiUrl(requireNonEmpty(toriiUrl, "toriiUrl")),
    worldAddress: requireNonEmpty(worldAddress, "worldAddress"),
  });

  return await client;
}

export async function fetchEntities(
  client: ToriiClient,
  worldAddress: string,
  models: string[],
  clause?: Clause,
  limit = DEFAULT_ENTITY_LIMIT,
): Promise<Entity[]> {
  if (models.length === 0) throw new Error("models must include at least one model name");

  const query: Query = {
    world_addresses: [requireNonEmpty(worldAddress, "worldAddress")],
    pagination: {
      limit,
      cursor: undefined,
      direction: "Forward",
      order_by: [],
    },
    clause,
    no_hashed_keys: false,
    models,
    historical: false,
  };

  const page = await client.getEntities(query);
  return page.items;
}

export async function subscribeEntities(
  client: ToriiClient,
  worldAddress: string,
  clause: Clause,
  onEntity: (entity: Entity) => void | Promise<void>,
  onPayload?: (payload: unknown) => void,
): Promise<Subscription> {
  return await client.onEntityUpdated(clause, [requireNonEmpty(worldAddress, "worldAddress")], (payload: unknown) => {
    onPayload?.(payload);
    for (const entity of entityPayloads(payload)) {
      onEntity(entity as Entity);
    }
  });
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
