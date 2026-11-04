// L'objet des rayons pro (`documentation/pricing/moteur/plan-cache-du-catalogue.md`,
// lot C2) : une table « société → rayon compressé » et la version courante,
// dans le stockage SQLite de l'objet — la mémoire se perd quand il s'endort,
// la version ne doit pas se perdre.
//
// Ce fichier ne décide rien : chaque décision est dans `shelf-store.ts`, sous
// tests. Ici, seulement le SQL qui les relie.
import { DurableObject } from "cloudflare:workers";

import {
  acceptsStore,
  isFresh,
  keysToErase,
  parseEraseOrder,
  parseShelfCall,
  SHELF_VERSION_HEADER,
  type ShelfCall,
  type ShelfEntryMeta,
} from "./shelf-store";

/** Le nom de l'instance unique : une seule copie, quel que soit le nombre d'API (§ 4). */
export const PRO_SHELVES_INSTANCE = "pro-shelves-weur";

const VERSION_NAME = "version";

/** L'objet ne lit aucune liaison ni aucun secret. */
type ProShelvesEnv = Record<string, never>;

/**
 * Le magasin des rayons pro. Un Durable Object traite ses requêtes une à une ;
 * chaque décision ci-dessous se prend APRÈS le dernier `await`, d'un seul
 * tenant avec l'écriture qu'elle autorise — un effacement ne peut pas se
 * glisser entre le contrôle de version et le rangement.
 */
export class ProShelves extends DurableObject<ProShelvesEnv> {
  constructor(ctx: DurableObjectState, env: ProShelvesEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS shelves (key TEXT PRIMARY KEY, body BLOB NOT NULL, " +
        "version INTEGER NOT NULL, principal TEXT, expires_at INTEGER NOT NULL)",
    );
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value INTEGER NOT NULL)",
    );
  }

  override async fetch(request: Request): Promise<Response> {
    const call = parseShelfCall(request.method, new URL(request.url));
    if (call === null) {
      return new Response(null, { status: 400 });
    }
    return this.serve(call, request);
  }

  private async serve(call: ShelfCall, request: Request): Promise<Response> {
    switch (call.kind) {
      case "read":
        return this.read(call.key, call.nowMs);
      case "store":
        return this.store(call, await request.arrayBuffer());
      case "erase":
        return this.erase(await bodyJson(request));
    }
  }

  private read(key: string, nowMs: number): Response {
    const rows = this.ctx.storage.sql
      .exec<{ body: ArrayBuffer; expires_at: number }>(
        "SELECT body, expires_at FROM shelves WHERE key = ?",
        key,
      )
      .toArray();
    const row = rows[0];
    if (row !== undefined && isFresh(row.expires_at, nowMs)) {
      return new Response(row.body, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      });
    }
    if (row !== undefined) {
      this.ctx.storage.sql.exec("DELETE FROM shelves WHERE key = ?", key);
    }
    return new Response(null, {
      status: 404,
      headers: { [SHELF_VERSION_HEADER]: String(this.version()) },
    });
  }

  private store(call: Extract<ShelfCall, { kind: "store" }>, body: ArrayBuffer): Response {
    if (!acceptsStore(this.version(), call.version)) {
      return new Response(null, { status: 409 });
    }
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO shelves (key, body, version, principal, expires_at) VALUES (?, ?, ?, ?, ?)",
      call.key,
      body,
      call.version,
      call.principalId,
      call.expiresAtMs,
    );
    return new Response(null, { status: 201 });
  }

  private erase(body: unknown): Response {
    const order = parseEraseOrder(body);
    if (order === null) {
      return new Response(null, { status: 400 });
    }
    this.ctx.storage.sql.exec(
      "INSERT INTO meta (name, value) VALUES (?, 1) " +
        "ON CONFLICT(name) DO UPDATE SET value = value + 1",
      VERSION_NAME,
    );
    if (order.kind === "all") {
      this.ctx.storage.sql.exec("DELETE FROM shelves");
      return new Response(null, { status: 204 });
    }
    const entries = this.ctx.storage.sql
      .exec<{ key: string; principal: string | null }>("SELECT key, principal FROM shelves")
      .toArray()
      .map((row): ShelfEntryMeta => ({ key: row.key, principalId: row.principal }));
    for (const key of keysToErase(entries, order.companyIds)) {
      this.ctx.storage.sql.exec("DELETE FROM shelves WHERE key = ?", key);
    }
    return new Response(null, { status: 204 });
  }

  private version(): number {
    const rows = this.ctx.storage.sql
      .exec<{ value: number }>("SELECT value FROM meta WHERE name = ?", VERSION_NAME)
      .toArray();
    return rows[0]?.value ?? 0;
  }
}

/** Le corps d'un effacement ; `null` s'il n'est pas du JSON (refusé en 400). */
async function bodyJson(request: Request): Promise<unknown> {
  try {
    const parsed: unknown = await request.json();
    return parsed;
  } catch {
    return null;
  }
}
