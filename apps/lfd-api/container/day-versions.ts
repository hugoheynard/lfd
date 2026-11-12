// L'objet des journées (`documentation/caching-usage/plan-objet-des-journees.md`,
// lot 1) : par (révision, journée), la carte complète des numéros et l'instant
// où l'API a commencé à la lire. Le stockage SQLite survit à l'endormissement.
//
// Ce fichier ne décide rien : chaque décision est dans `day-versions-store.ts`,
// sous tests. Ici, seulement le SQL qui les relie.
import { DurableObject } from "cloudflare:workers";

import {
  acceptsCard,
  oldestKeptDay,
  parseDayCard,
  parseDayVersionsCall,
  type DayCard,
} from "./day-versions-store";

/** Le nom de l'instance unique : une seule copie, quel que soit le nombre d'API. */
export const DAY_VERSIONS_INSTANCE = "day-versions-weur";

/** Une carte plus ancienne que la gardée : ignorée, sans faute. */
const STATUS_OLDER = 409;

/** L'objet ne lit aucune liaison ni aucun secret. */
type DayVersionsEnv = Record<string, never>;

/**
 * Le magasin des numéros de journée. Un Durable Object traite ses requêtes une
 * à une ; la comparaison des instants et l'écriture se font d'un seul tenant,
 * après le dernier `await`.
 */
export class DayVersions extends DurableObject<DayVersionsEnv> {
  constructor(ctx: DurableObjectState, env: DayVersionsEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS cards (key TEXT PRIMARY KEY, service_day TEXT NOT NULL, " +
        "versions TEXT NOT NULL, read_at INTEGER NOT NULL)",
    );
  }

  override async fetch(request: Request): Promise<Response> {
    const call = parseDayVersionsCall(request.method, new URL(request.url));
    if (call === null) {
      return new Response(null, { status: 400 });
    }
    if (call.kind === "read") {
      return this.read(call.key);
    }
    const card = parseDayCard(await bodyJson(request));
    return card === null
      ? new Response(null, { status: 400 })
      : this.store(call.key, call.serviceDay, card);
  }

  private read(key: string): Response {
    const row = this.ctx.storage.sql
      .exec<{ versions: string; read_at: number }>(
        "SELECT versions, read_at FROM cards WHERE key = ?",
        key,
      )
      .toArray()[0];
    if (row === undefined) {
      return new Response(null, { status: 404 });
    }
    return new Response(`{"versions":${row.versions},"readAtMs":${row.read_at}}`, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  private store(key: string, serviceDay: string, card: DayCard): Response {
    const kept = this.ctx.storage.sql
      .exec<{ read_at: number }>("SELECT read_at FROM cards WHERE key = ?", key)
      .toArray()[0];
    if (!acceptsCard(kept?.read_at ?? null, card.readAtMs)) {
      return new Response(null, { status: STATUS_OLDER });
    }
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO cards (key, service_day, versions, read_at) VALUES (?, ?, ?, ?)",
      key,
      serviceDay,
      JSON.stringify(card.versions),
      card.readAtMs,
    );
    this.ctx.storage.sql.exec(
      "DELETE FROM cards WHERE service_day < ?",
      oldestKeptDay(card.readAtMs),
    );
    return new Response(null, { status: 201 });
  }
}

/** Le corps d'un rangement ; `null` s'il n'est pas du JSON (refusé en 400). */
async function bodyJson(request: Request): Promise<unknown> {
  try {
    const parsed: unknown = await request.json();
    return parsed;
  } catch {
    return null;
  }
}
