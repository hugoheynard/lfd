// La table `contents` de l'objet des journées
// (`documentation/caching-usage/le-cache-du-back-office.md`, § 3) : par
// (révision, clé opaque), la dernière charge rangée et son numéro. Le SQL
// passe par `MetricsSql`, la forme commune du stockage SQLite d'un Durable
// Object et de celui de Node — d'où des tests sur une vraie base SQLite.
// Chaque décision est dans `versioned-contents-store.ts`.
import {
  type MetricsSql,
  type MetricsSqlValue,
  servedPersonOf,
  sizesByContentCache,
} from "./cache-metrics-store";
import type { HourlyCacheMetrics } from "./hourly-cache-metrics";
import {
  acceptsContentBody,
  CONTENT_RAW_BYTES_HEADER,
  type ContentCall,
  rawBytesOf,
  servesContent,
} from "./versioned-contents-store";

// Une ligne par clé : la charge rangée remplace la précédente. `body` porte
// les octets compressés par l'API (un BLOB : SQLite ne convertit pas un BLOB
// rangé dans une colonne d'affinité TEXT) ; une ligne rangée en clair reste
// lisible par l'API, et le prochain rangement la remplace.
const SCHEMA =
  "CREATE TABLE IF NOT EXISTS contents (key TEXT PRIMARY KEY, version INTEGER NOT NULL, " +
  "body TEXT NOT NULL)";

interface ContentRow extends Record<string, MetricsSqlValue> {
  version: number;
  body: ArrayBuffer | string;
}

interface SizeRow extends Record<string, MetricsSqlValue> {
  key: string;
  bytes: number;
  raw_bytes: number | null;
}

/** Ce qu'un appel rend : le statut, et les octets d'une lecture servie. */
export interface ContentReply {
  readonly status: number;
  readonly body: ArrayBuffer | string | null;
}

/**
 * **Une ligne par (révision, clé)**, servie à numéro ÉGAL. Un rangement
 * efface les lignes de toute AUTRE révision du code : ce code ne les lira
 * plus jamais. Pendant un déploiement, deux révisions qui rangent tour à
 * tour s'effacent l'une l'autre ; cela ne coûte qu'une relecture en base, le
 * temps que l'ancienne s'arrête.
 */
export class VersionedContentsTable {
  constructor(
    private readonly sql: MetricsSql,
    private readonly metrics: HourlyCacheMetrics,
  ) {
    this.sql.exec(SCHEMA);
    this.addRawBytesColumn();
  }

  /** Répond à un appel HTTP de l'objet ; `nowMs` est une mesure, pour les compteurs. */
  async respond(
    call: ContentCall,
    request: Request,
    cache: string,
    nowMs: number,
  ): Promise<Response> {
    const body = call.kind === "content-store" ? new Uint8Array(await request.arrayBuffer()) : null;
    const reply = this.answer(call, body, {
      cache,
      rawBytes: rawBytesOf(request.headers.get(CONTENT_RAW_BYTES_HEADER)),
      nowMs,
      person: servedPersonOf(request.headers),
    });
    return reply.body === null
      ? new Response(null, { status: reply.status })
      : new Response(reply.body, { headers: { "content-type": "application/octet-stream" } });
  }

  /** Répond à un appel et le compte sous le cache que la clé porte en préfixe. */
  answer(call: ContentCall, body: Uint8Array | null, context: ContentContext): ContentReply {
    const { cache, nowMs } = context;
    if (call.kind === "content-read") {
      const reply = this.read(call);
      this.metrics.count(cache, reply.status === 200 ? "hit" : "miss", nowMs, context.person);
      return reply;
    }
    const reply = this.store(call, body ?? new Uint8Array(), context.rawBytes);
    this.metrics.count(cache, reply.status === 201 ? "store" : "too_large", nowMs);
    if (reply.status === 201) {
      this.recordSize(cache, nowMs);
    }
    return reply;
  }

  private read(call: ContentCall): ContentReply {
    const [row] = this.sql
      .exec<ContentRow>("SELECT version, body FROM contents WHERE key = ?", call.key)
      .toArray();
    return row !== undefined && servesContent(row.version, call.version)
      ? { status: 200, body: row.body }
      : { status: 404, body: null };
  }

  private store(call: ContentCall, body: Uint8Array, rawBytes: number | null): ContentReply {
    if (!acceptsContentBody(body)) {
      return { status: 413, body: null };
    }
    this.sql.exec(
      "INSERT OR REPLACE INTO contents (key, version, body, raw_bytes) VALUES (?, ?, ?, ?)",
      call.key,
      call.version,
      ownedCopy(body),
      rawBytes,
    );
    this.sql.exec(
      "DELETE FROM contents WHERE substr(key, 1, ?) <> ?",
      call.revisionPrefix.length,
      call.revisionPrefix,
    );
    return { status: 201, body: null };
  }

  private recordSize(cache: string, nowMs: number): void {
    try {
      const rows = this.sql
        .exec<SizeRow>("SELECT key, length(CAST(body AS BLOB)) AS bytes, raw_bytes FROM contents")
        .toArray()
        .map((row) => ({ key: row.key, bytes: row.bytes, rawBytes: row.raw_bytes }));
      const size = sizesByContentCache(rows).get(cache);
      if (size !== undefined) {
        this.metrics.size(cache, size, nowMs);
      }
    } catch (error) {
      console.error("Taille des contenus non relevée", error);
    }
  }

  /**
   * La taille en clair, ajoutée à une table créée avant la compression.
   * SQLite n'a pas d'`ADD COLUMN IF NOT EXISTS` : on lit les colonnes avant.
   */
  private addRawBytesColumn(): void {
    const present = this.sql
      .exec<{ name: string }>("SELECT name FROM pragma_table_info('contents')")
      .toArray();
    if (!present.some((column) => column.name === "raw_bytes")) {
      this.sql.exec("ALTER TABLE contents ADD COLUMN raw_bytes INTEGER");
    }
  }
}

/** Ce que l'appel apporte en plus de sa charge. */
export interface ContentContext {
  readonly cache: string;
  readonly rawBytes: number | null;
  readonly nowMs: number;
  readonly person: string | null;
}

/** Les octets dans un `ArrayBuffer` à soi : SQLite range un BLOB, pas une vue. */
function ownedCopy(body: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(body.byteLength);
  new Uint8Array(copy).set(body);
  return copy;
}
