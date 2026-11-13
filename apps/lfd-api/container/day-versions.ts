// L'objet des journées (`documentation/caching-usage/le-cache-du-back-office.md`,
// et `le-cache-du-back-office.md` § 2.3) : par (révision, portée) — une journée ou
// `global` —, le numéro de chaque sujet et l'instant où l'API a commencé à le
// lire. Le stockage SQLite survit à l'endormissement.
//
// Ce fichier ne décide rien : chaque décision est dans `day-versions-store.ts`,
// sous tests. Ici, seulement le SQL qui les relie.
import { DurableObject } from "cloudflare:workers";

import {
  acceptsCard,
  GLOBAL_SCOPE,
  oldestKeptDay,
  parseDayVersionsCall,
  parseVersionsCard,
  type SubjectReading,
  type VersionsCard,
} from "./day-versions-store";
import {
  contentCacheOfPath,
  DAY_VERSIONS_METRICS_CACHE,
  parseMetricsCall,
  sizesByContentCache,
  servedPersonOf,
} from "./cache-metrics-store";
import { DayContentsTable } from "./day-contents";
import { parseDayContentCall } from "./day-contents-store";
import { HourlyCacheMetrics } from "./hourly-cache-metrics";
import {
  acceptsContentBody,
  CONTENT_RAW_BYTES_HEADER,
  type ContentCall,
  parseContentCall,
  rawBytesOf,
  servesContent,
} from "./versioned-contents-store";

/** Le nom de l'instance unique : une seule copie, quel que soit le nombre d'API. */
export const DAY_VERSIONS_INSTANCE = "day-versions-weur";

/** Les deux entiers d'une ligne de carte (`version`, `read_at`), comptés huit octets chacun. */
const CARD_ROW_INTEGER_BYTES = 16;

/** L'objet ne lit aucune liaison ni aucun secret. */
type DayVersionsEnv = Record<string, never>;

interface SubjectRow extends Record<string, string | number> {
  subject: string;
  version: number;
  read_at: number;
}

interface ContentRow extends Record<string, ArrayBuffer | string | number> {
  version: number;
  body: ArrayBuffer | string;
}

/**
 * Le magasin des numéros, et des contenus versionnés (`contents`, § 3.5 de
 * `le-cache-du-back-office.md`). Un Durable Object traite ses requêtes une à une ;
 * la comparaison des instants et l'écriture se font d'un seul tenant, après
 * le dernier `await`.
 *
 * Une ligne par (clé, sujet) : un rangement se FUSIONNE à la carte gardée,
 * sujet par sujet. La table `cards` (une carte entière par journée) est celle
 * d'une image précédente : un cache, retiré au premier démarrage.
 */
export class DayVersions extends DurableObject<DayVersionsEnv> {
  private readonly metrics: HourlyCacheMetrics;
  private readonly dayContents: DayContentsTable;

  constructor(ctx: DurableObjectState, env: DayVersionsEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec("DROP TABLE IF EXISTS cards");
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS subject_cards (key TEXT NOT NULL, scope TEXT NOT NULL, " +
        "subject TEXT NOT NULL, version INTEGER NOT NULL, read_at INTEGER NOT NULL, " +
        "PRIMARY KEY (key, subject))",
    );
    // Une ligne par clé : la charge rangée remplace la précédente, les
    // versions remplacées ne s'accumulent pas. `body` porte les octets
    // compressés par l'API (un BLOB : SQLite ne convertit pas un BLOB rangé
    // dans une colonne d'affinité TEXT) ; une ligne rangée en clair avant la
    // compression reste lisible par l'API, et le prochain rangement la remplace.
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS contents (key TEXT PRIMARY KEY, version INTEGER NOT NULL, " +
        "body TEXT NOT NULL)",
    );
    this.addRawBytesColumn();
    this.metrics = new HourlyCacheMetrics(this.ctx.storage.sql);
    // Les contenus des écrans de journée (`day-contents.ts`) : leur table,
    // servie à étiquette égale.
    this.dayContents = new DayContentsTable(this.ctx.storage.sql, this.metrics);
  }

  override async fetch(request: Request): Promise<Response> {
    // L'heure est une mesure : aucune décision de l'objet n'en dépend.
    this.metrics.request(Date.now());
    const url = new URL(request.url);
    const metrics = parseMetricsCall(request.method, url);
    if (metrics !== null) {
      return Response.json(this.metrics.read(metrics.sinceMs));
    }
    const dayContent = parseDayContentCall(request.method, url);
    if (dayContent !== null) {
      return this.dayContents.respond(dayContent, request, Date.now());
    }
    const content = parseContentCall(request.method, url);
    if (content !== null) {
      return this.content(content, request, contentCacheOfPath(url.pathname));
    }
    const call = parseDayVersionsCall(request.method, url);
    if (call === null) {
      return new Response(null, { status: 400 });
    }
    if (call.kind === "read") {
      const read = this.read(call.key);
      this.metrics.count(
        DAY_VERSIONS_METRICS_CACHE,
        read.ok ? "hit" : "miss",
        Date.now(),
        servedPersonOf(request.headers),
      );
      return read;
    }
    const card = parseVersionsCard(await bodyJson(request));
    return card === null
      ? new Response(null, { status: 400 })
      : this.store(call.key, call.scope, card);
  }

  private async content(call: ContentCall, request: Request, cache: string): Promise<Response> {
    const response = await this.contentResponse(call, request);
    this.countContent(call, cache, response.status, servedPersonOf(request.headers));
    return response;
  }

  /**
   * Les compteurs d'un appel de contenu, au nom du cache que la clé porte en
   * préfixe. L'heure est une mesure : le seul `Date.now()` de l'objet, et
   * aucune décision n'en dépend.
   */
  private countContent(
    call: ContentCall,
    cache: string,
    status: number,
    person: string | null,
  ): void {
    const nowMs = Date.now();
    if (call.kind === "content-read") {
      this.metrics.count(cache, status === 200 ? "hit" : "miss", nowMs, person);
      return;
    }
    this.metrics.count(cache, status === 201 ? "store" : "too_large", nowMs);
    if (status === 201) {
      this.recordContentSize(cache, nowMs);
    }
  }

  private recordContentSize(cache: string, nowMs: number): void {
    try {
      const rows = this.ctx.storage.sql
        .exec<{ key: string; bytes: number }>(
          "SELECT key, length(CAST(body AS BLOB)) AS bytes FROM contents",
        )
        .toArray();
      const size = sizesByContentCache(rows).get(cache);
      if (size !== undefined) {
        this.metrics.size(cache, size, nowMs);
      }
    } catch (error) {
      console.error("Taille des contenus non relevée", error);
    }
  }

  /**
   * La taille en clair, ajoutée à une table créée avant la compression. SQLite
   * n'a pas d'`ADD COLUMN IF NOT EXISTS` : une colonne déjà là refuse
   * l'ajout, et seul ce refus-là est attendu.
   */
  private addRawBytesColumn(): void {
    try {
      this.ctx.storage.sql.exec("ALTER TABLE contents ADD COLUMN raw_bytes INTEGER");
    } catch (error) {
      if (!String(error).includes("duplicate column")) {
        throw error;
      }
    }
  }

  private async contentResponse(call: ContentCall, request: Request): Promise<Response> {
    if (call.kind === "content-read") {
      const [row] = this.ctx.storage.sql
        .exec<ContentRow>("SELECT version, body FROM contents WHERE key = ?", call.key)
        .toArray();
      return row !== undefined && servesContent(row.version, call.version)
        ? new Response(row.body, { headers: { "content-type": "application/octet-stream" } })
        : new Response(null, { status: 404 });
    }
    const body = new Uint8Array(await request.arrayBuffer());
    if (!acceptsContentBody(body)) {
      return new Response(null, { status: 413 });
    }
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO contents (key, version, body, raw_bytes) VALUES (?, ?, ?, ?)",
      call.key,
      call.version,
      body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
      rawBytesOf(request.headers.get(CONTENT_RAW_BYTES_HEADER)),
    );
    return new Response(null, { status: 201 });
  }

  private rows(key: string): SubjectRow[] {
    return this.ctx.storage.sql
      .exec<SubjectRow>("SELECT subject, version, read_at FROM subject_cards WHERE key = ?", key)
      .toArray();
  }

  private read(key: string): Response {
    const rows = this.rows(key);
    if (rows.length === 0) {
      return new Response(null, { status: 404 });
    }
    const subjects: Record<string, SubjectReading> = {};
    for (const row of rows) {
      subjects[row.subject] = { version: row.version, readAtMs: row.read_at };
    }
    return Response.json({ subjects });
  }

  private store(key: string, scope: string, card: VersionsCard): Response {
    const kept = new Map(this.rows(key).map((row) => [row.subject, row.read_at]));
    let newest = 0;
    for (const [subject, reading] of Object.entries(card.subjects)) {
      newest = Math.max(newest, reading.readAtMs);
      if (!acceptsCard(kept.get(subject) ?? null, reading.readAtMs)) {
        continue;
      }
      this.ctx.storage.sql.exec(
        "INSERT OR REPLACE INTO subject_cards (key, scope, subject, version, read_at) " +
          "VALUES (?, ?, ?, ?, ?)",
        key,
        scope,
        subject,
        reading.version,
        reading.readAtMs,
      );
    }
    if (newest > 0) {
      this.ctx.storage.sql.exec(
        "DELETE FROM subject_cards WHERE scope <> ? AND scope < ?",
        GLOBAL_SCOPE,
        oldestKeptDay(newest),
      );
    }
    this.countCardsStore();
    return new Response(null, { status: 201 });
  }

  /** Un rangement de carte, et la taille des cartes gardées (texte + deux entiers par ligne). */
  private countCardsStore(): void {
    const nowMs = Date.now();
    this.metrics.count(DAY_VERSIONS_METRICS_CACHE, "store", nowMs);
    try {
      const [size] = this.ctx.storage.sql
        .exec<{ bytes: number | null; entries: number }>(
          "SELECT SUM(length(CAST(key AS BLOB)) + length(CAST(scope AS BLOB)) + " +
            "length(CAST(subject AS BLOB)) + ?) AS bytes, COUNT(*) AS entries FROM subject_cards",
          CARD_ROW_INTEGER_BYTES,
        )
        .toArray();
      if (size !== undefined) {
        this.metrics.size(
          DAY_VERSIONS_METRICS_CACHE,
          { bytes: size.bytes ?? 0, entries: size.entries },
          nowMs,
        );
      }
    } catch (error) {
      console.error("Taille des cartes non relevée", error);
    }
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
