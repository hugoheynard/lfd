// La table `day_contents` de l'objet des journées
// (`documentation/caching-usage/le-cache-du-back-office.md`, § 3.1). Le SQL
// passe par `MetricsSql`, la forme commune du stockage SQLite d'un Durable
// Object et de celui de Node — d'où des tests sur une vraie base SQLite.
// Chaque décision est dans `day-contents-store.ts`.
import { type MetricsSql, type MetricsSqlValue, servedPersonOf } from "./cache-metrics-store";
import {
  type DayContentCall,
  dayContentsCacheOf,
  replacesDayContent,
  servesDayContent,
} from "./day-contents-store";
import { oldestKeptDay } from "./day-versions-store";
import type { HourlyCacheMetrics } from "./hourly-cache-metrics";
import {
  acceptsContentBody,
  CONTENT_RAW_BYTES_HEADER,
  rawBytesOf,
} from "./versioned-contents-store";

const SCHEMA =
  "CREATE TABLE IF NOT EXISTS day_contents (key TEXT PRIMARY KEY, screen TEXT NOT NULL, " +
  "day TEXT NOT NULL, tag TEXT NOT NULL, body BLOB NOT NULL, raw_bytes INTEGER)";

/**
 * L'en-tête d'un 404 de l'OBJET sur une lecture : « rien de gardé sous cette
 * étiquette ». Un 404 sans lui vient d'ailleurs (aiguillage du Worker) et
 * l'API le journalise. Recopié par l'API
 * (`durable-object-day-contents-cache.ts`), qui ne peut pas importer d'ici.
 */
export const DAY_CONTENT_ABSENT_HEADER = "x-day-content";
export const DAY_CONTENT_ABSENT = "absent";

/** Statut d'un rangement refusé parce que la ligne gardée est plus récente ou incomparable. */
export const DAY_CONTENT_KEPT_STATUS = 202;

interface TagRow extends Record<string, MetricsSqlValue> {
  tag: string;
}

interface BodyRow extends Record<string, MetricsSqlValue> {
  tag: string;
  body: ArrayBuffer | string;
}

interface SizeRow extends Record<string, MetricsSqlValue> {
  bytes: number | null;
  entries: number;
}

/** Ce qu'un appel rend : le statut, et les octets d'une lecture servie. */
export interface DayContentReply {
  readonly status: number;
  readonly body: ArrayBuffer | string | null;
}

/**
 * **Une ligne par (révision, écran, journée)** : la dernière charge rangée et
 * son étiquette. Servie à étiquette ÉGALE ; remplacée seulement par une
 * étiquette qui domine (`replacesDayContent`) ; les journées de plus de trois
 * jours (horloge de l'objet) s'oublient au rangement, toutes révisions
 * comprises, et une autre révision du même écran et de la même journée est
 * retirée — elle ne sera plus jamais lue par ce code.
 */
export class DayContentsTable {
  constructor(
    private readonly sql: MetricsSql,
    private readonly metrics: HourlyCacheMetrics,
  ) {
    this.sql.exec(SCHEMA);
  }

  /**
   * Répond à un appel HTTP de l'objet. `nowMs` est l'horloge de l'objet :
   * une mesure pour les compteurs, et le repère du ménage (`forget`).
   */
  async respond(call: DayContentCall, request: Request, nowMs: number): Promise<Response> {
    const body =
      call.kind === "day-content-store" ? new Uint8Array(await request.arrayBuffer()) : null;
    const reply = this.answer(
      call,
      body,
      rawBytesOf(request.headers.get(CONTENT_RAW_BYTES_HEADER)),
      nowMs,
      servedPersonOf(request.headers),
    );
    if (reply.body === null && call.kind === "day-content-read") {
      return new Response(null, {
        status: reply.status,
        headers: { [DAY_CONTENT_ABSENT_HEADER]: DAY_CONTENT_ABSENT },
      });
    }
    return reply.body === null
      ? new Response(null, { status: reply.status })
      : new Response(reply.body, { headers: { "content-type": "application/octet-stream" } });
  }

  /** Répond à un appel et le compte sous `day-<écran>`. */
  answer(
    call: DayContentCall,
    body: Uint8Array | null,
    rawBytes: number | null,
    nowMs: number,
    person: string | null,
  ): DayContentReply {
    const cache = dayContentsCacheOf(call.screen);
    if (call.kind === "day-content-read") {
      const reply = this.read(call);
      this.metrics.count(cache, reply.status === 200 ? "hit" : "miss", nowMs, person);
      return reply;
    }
    const reply = this.store(call, body ?? new Uint8Array(), rawBytes, nowMs);
    if (reply.status === 413) {
      this.metrics.count(cache, "too_large", nowMs);
    } else if (reply.status === 201) {
      this.metrics.count(cache, "store", nowMs);
      this.recordSize(call.screen, cache, nowMs);
    }
    return reply;
  }

  private read(call: DayContentCall): DayContentReply {
    const [row] = this.sql
      .exec<BodyRow>("SELECT tag, body FROM day_contents WHERE key = ?", call.key)
      .toArray();
    return row !== undefined && servesDayContent(row.tag, call.tag)
      ? { status: 200, body: row.body }
      : { status: 404, body: null };
  }

  private store(
    call: DayContentCall,
    body: Uint8Array,
    rawBytes: number | null,
    nowMs: number,
  ): DayContentReply {
    if (!acceptsContentBody(body)) {
      return { status: 413, body: null };
    }
    const [kept] = this.sql
      .exec<TagRow>("SELECT tag FROM day_contents WHERE key = ?", call.key)
      .toArray();
    if (!replacesDayContent(kept?.tag ?? null, call.tag)) {
      return { status: DAY_CONTENT_KEPT_STATUS, body: null };
    }
    this.sql.exec(
      "INSERT OR REPLACE INTO day_contents (key, screen, day, tag, body, raw_bytes) " +
        "VALUES (?, ?, ?, ?, ?, ?)",
      call.key,
      call.screen,
      call.day,
      call.tag,
      ownedCopy(body),
      rawBytes,
    );
    this.forget(call, nowMs);
    return { status: 201, body: null };
  }

  /**
   * Le ménage se règle sur l'horloge de l'OBJET, pas sur la journée rangée :
   * ranger une journée future (plan, tournées de la semaine) n'efface pas
   * aujourd'hui. Cette horloge ne décide d'aucun ordre entre deux rangements
   * (c'est l'étiquette) ; elle dit seulement ce qui est assez vieux pour
   * être oublié — une horloge en avance ne coûte qu'une relecture en base.
   */
  private forget(call: DayContentCall, nowMs: number): void {
    this.sql.exec("DELETE FROM day_contents WHERE day < ?", oldestKeptDay(nowMs));
    this.sql.exec(
      "DELETE FROM day_contents WHERE screen = ? AND day = ? AND key <> ?",
      call.screen,
      call.day,
      call.key,
    );
  }

  private recordSize(screen: string, cache: string, nowMs: number): void {
    const [size] = this.sql
      .exec<SizeRow>(
        "SELECT SUM(length(body)) AS bytes, COUNT(*) AS entries FROM day_contents WHERE screen = ?",
        screen,
      )
      .toArray();
    if (size !== undefined) {
      this.metrics.size(cache, { bytes: size.bytes ?? 0, entries: size.entries }, nowMs);
    }
  }
}

/** Les octets dans un `ArrayBuffer` à soi : SQLite range un BLOB, pas une vue. */
function ownedCopy(body: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(body.byteLength);
  new Uint8Array(copy).set(body);
  return copy;
}
