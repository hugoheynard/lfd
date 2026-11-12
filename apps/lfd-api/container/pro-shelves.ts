// L'objet des rayons pro (`documentation/caching-usage/le-rayon-en-cache.md`,
// lot C2) : une table « société → rayon compressé » et la version courante,
// dans le stockage SQLite de l'objet — la mémoire se perd quand il s'endort,
// la version ne doit pas se perdre.
//
// Ce fichier ne décide rien : chaque décision est dans `shelf-store.ts`, sous
// tests. Ici, seulement le SQL qui les relie.
import { DurableObject } from "cloudflare:workers";

import { parseMetricsCall, PRO_SHELVES_METRICS_CACHE, servedPersonOf } from "./cache-metrics-store";
import { HourlyCacheMetrics } from "./hourly-cache-metrics";
import {
  isEnabled,
  isPublicEnabled,
  keysToErase,
  parseEraseOrder,
  parseShelfCall,
  parseSwitchAction,
  servesEntry,
  SHELF_VERSION_HEADER,
  storeDecision,
  switchPlan,
  type ShelfCall,
  type ShelfEntryMeta,
} from "./shelf-store";

/** Le nom de l'instance unique : une seule copie, quel que soit le nombre d'API (§ 4). */
export const PRO_SHELVES_INSTANCE = "pro-shelves-weur";

const VERSION_NAME = "version";
/** 1 allumé, 0 éteint ; absent = allumé (l'objet déployé par C2, avant tout geste). */
const ENABLED_NAME = "enabled";
/** Le drapeau du rayon public (C3) : 1 allumé ; absent ou 0 = ÉTEINT (`isPublicEnabled`). */
const PUBLIC_ENABLED_NAME = "public_enabled";

/** Rangement non gardé : l'objet est éteint (`not_kept` côté API). */
const STATUS_NOT_KEPT = 202;

/** L'objet ne lit aucune liaison ni aucun secret. */
type ProShelvesEnv = Record<string, never>;

/**
 * Le magasin des rayons pro. Un Durable Object traite ses requêtes une à une ;
 * chaque décision ci-dessous se prend APRÈS le dernier `await`, d'un seul
 * tenant avec l'écriture qu'elle autorise — un effacement ne peut pas se
 * glisser entre le contrôle de version et le rangement.
 */
export class ProShelves extends DurableObject<ProShelvesEnv> {
  private readonly metrics: HourlyCacheMetrics;

  constructor(ctx: DurableObjectState, env: ProShelvesEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS shelves (key TEXT PRIMARY KEY, body BLOB NOT NULL, " +
        "version INTEGER NOT NULL, principal TEXT, expires_at INTEGER NOT NULL)",
    );
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS meta (name TEXT PRIMARY KEY, value INTEGER NOT NULL)",
    );
    this.metrics = new HourlyCacheMetrics(this.ctx.storage.sql);
  }

  override async fetch(request: Request): Promise<Response> {
    // L'heure est une mesure : aucune décision de l'objet n'en dépend.
    this.metrics.request(Date.now());
    const url = new URL(request.url);
    const metrics = parseMetricsCall(request.method, url);
    if (metrics !== null) {
      return Response.json(this.metrics.read(metrics.sinceMs));
    }
    const call = parseShelfCall(request.method, url);
    if (call === null) {
      return new Response(null, { status: 400 });
    }
    return this.serve(call, request);
  }

  private async serve(call: ShelfCall, request: Request): Promise<Response> {
    const response = await this.answer(call, request);
    this.countCall(call.kind, response.status, servedPersonOf(request.headers));
    return response;
  }

  /**
   * Les compteurs d'un appel, après la réponse décidée. L'heure est une
   * mesure : aucune décision de l'objet n'en dépend (l'échéance d'un rayon se
   * juge sur l'instant de l'API).
   */
  private countCall(kind: ShelfCall["kind"], status: number, person: string | null): void {
    const nowMs = Date.now();
    if (kind === "read") {
      this.metrics.count(PRO_SHELVES_METRICS_CACHE, status === 200 ? "hit" : "miss", nowMs, person);
      return;
    }
    if (kind === "store" && status === 201) {
      this.metrics.count(PRO_SHELVES_METRICS_CACHE, "store", nowMs);
    }
    if (kind === "store" || kind === "erase" || kind === "switch") {
      this.recordSize(nowMs);
    }
  }

  private recordSize(nowMs: number): void {
    try {
      const [size] = this.ctx.storage.sql
        .exec<{ bytes: number | null; entries: number }>(
          "SELECT SUM(length(body) + length(CAST(key AS BLOB))) AS bytes, COUNT(*) AS entries " +
            "FROM shelves",
        )
        .toArray();
      if (size !== undefined) {
        this.metrics.size(
          PRO_SHELVES_METRICS_CACHE,
          { bytes: size.bytes ?? 0, entries: size.entries },
          nowMs,
        );
      }
    } catch (error) {
      console.error("Taille des rayons non relevée", error);
    }
  }

  private async answer(call: ShelfCall, request: Request): Promise<Response> {
    switch (call.kind) {
      case "read":
        return this.read(call.key, call.nowMs);
      case "store":
        return this.store(call, await request.arrayBuffer());
      case "erase":
        return this.erase(await bodyJson(request));
      case "switch":
        return this.switch(await bodyJson(request));
      case "public_state":
        return this.publicState();
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
    if (row !== undefined && servesEntry(this.enabled(), row.expires_at, nowMs)) {
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
    const decision = storeDecision(this.enabled(), this.version(), call.version);
    if (decision === "not_kept") {
      return new Response(null, { status: STATUS_NOT_KEPT });
    }
    if (decision === "stale") {
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
    this.bumpVersion();
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

  /** Un geste de l'interrupteur ; rend l'état qui en résulte. */
  private switch(body: unknown): Response {
    const action = parseSwitchAction(body);
    if (action === null) {
      return new Response(null, { status: 400 });
    }
    const plan = switchPlan(action);
    if (plan.enabled !== null) {
      this.writeFlag(ENABLED_NAME, plan.enabled);
    }
    if (plan.publicEnabled !== null) {
      this.writeFlag(PUBLIC_ENABLED_NAME, plan.publicEnabled);
    }
    if (plan.eraseAll) {
      this.bumpVersion();
      this.ctx.storage.sql.exec("DELETE FROM shelves");
    }
    return Response.json({
      enabled: this.enabled(),
      publicEnabled: this.publicEnabled(),
      version: this.version(),
    });
  }

  /** Le drapeau public et la version, relevés par l'API autour d'un rayon public (C3). */
  private publicState(): Response {
    return Response.json({ publicEnabled: this.publicEnabled(), version: this.version() });
  }

  private writeFlag(name: string, value: boolean): void {
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO meta (name, value) VALUES (?, ?)",
      name,
      value ? 1 : 0,
    );
  }

  private bumpVersion(): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO meta (name, value) VALUES (?, 1) " +
        "ON CONFLICT(name) DO UPDATE SET value = value + 1",
      VERSION_NAME,
    );
  }

  private enabled(): boolean {
    return isEnabled(this.flag(ENABLED_NAME));
  }

  private publicEnabled(): boolean {
    return isPublicEnabled(this.flag(PUBLIC_ENABLED_NAME));
  }

  private flag(name: string): number | undefined {
    const rows = this.ctx.storage.sql
      .exec<{ value: number }>("SELECT value FROM meta WHERE name = ?", name)
      .toArray();
    return rows[0]?.value;
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
