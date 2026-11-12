// La table horaire des objets partagés (`documentation/caching-usage/
// le-cache-du-back-office.md`, § 6). Le SQL passe par `MetricsSql`, la forme commune
// du stockage SQLite d'un Durable Object et de celui de Node — d'où des tests
// sur une vraie base SQLite.
//
// 🔴 Un compteur ne fait JAMAIS échouer ce qu'il compte : toute erreur est
// avalée et journalisée une fois par instance de l'objet.
import {
  type CacheMetricEvent,
  type CacheMetricsReply,
  type CacheMetricsRow,
  type CacheSize,
  hourOf,
  type MetricsSql,
  type MetricsSqlValue,
  oldestKeptHour,
  PerSecondCounter,
} from "./cache-metrics-store";

const COLUMN_OF: Readonly<Record<CacheMetricEvent, string>> = {
  hit: "hits",
  miss: "misses",
  store: "stores",
  too_large: "too_large",
};

const SCHEMA = [
  "CREATE TABLE IF NOT EXISTS metrics_hourly (cache TEXT NOT NULL, hour INTEGER NOT NULL, " +
    "hits INTEGER NOT NULL DEFAULT 0, misses INTEGER NOT NULL DEFAULT 0, " +
    "stores INTEGER NOT NULL DEFAULT 0, too_large INTEGER NOT NULL DEFAULT 0, " +
    "bytes INTEGER, entries INTEGER, persons INTEGER NOT NULL DEFAULT 0, " +
    "PRIMARY KEY (cache, hour))",
  // Les empreintes de l'heure EN COURS seulement : vidées à la clôture de
  // l'heure, seul leur compte reste dans `metrics_hourly.persons`.
  "CREATE TABLE IF NOT EXISTS served_persons (cache TEXT NOT NULL, hour INTEGER NOT NULL, " +
    "person TEXT NOT NULL, PRIMARY KEY (cache, hour, person))",
  "CREATE TABLE IF NOT EXISTS object_peaks (hour INTEGER PRIMARY KEY, " +
    "per_second INTEGER NOT NULL)",
] as const;

interface StoredRow extends Record<string, MetricsSqlValue> {
  cache: string;
  hour: number;
  hits: number;
  misses: number;
  stores: number;
  too_large: number;
  bytes: number | null;
  entries: number | null;
  persons: number;
}

interface PeakRow extends Record<string, MetricsSqlValue> {
  hour: number;
  per_second: number;
}

/**
 * **La table horaire d'un objet** : une ligne par (cache, heure), et le pic
 * de requêtes par seconde de l'objet. L'objet appelle `request` à l'entrée de
 * chaque appel, puis `count` et `size` après avoir décidé de sa réponse.
 * L'heure vient de l'instant que l'objet passe — une mesure, jamais une
 * décision.
 */
export class HourlyCacheMetrics {
  private readonly seconds = new PerSecondCounter();
  private lastClosedHour = -1;
  private reported = false;

  constructor(
    private readonly sql: MetricsSql,
    private readonly report: (error: unknown) => void = defaultReport,
  ) {
    this.safely(() => {
      for (const statement of SCHEMA) {
        this.sql.exec(statement);
      }
    });
  }

  /** Une requête reçue, toutes routes confondues : le pic par seconde. */
  request(nowMs: number): void {
    this.safely(() => {
      const closed = this.seconds.tick(nowMs);
      if (closed !== null) {
        this.peak(closed.secondMs, closed.requests);
      }
      this.closeHour(nowMs);
    });
  }

  /**
   * Compte un évènement du cache dans l'heure de `nowMs` ; une lecture qui
   * porte une empreinte compte aussi sa personne, une fois par heure.
   */
  count(cache: string, event: CacheMetricEvent, nowMs: number, person: string | null = null): void {
    const column = COLUMN_OF[event];
    const hour = hourOf(nowMs);
    this.safely(() => {
      this.sql.exec(
        `INSERT INTO metrics_hourly (cache, hour, ${column}) VALUES (?, ?, 1) ` +
          `ON CONFLICT(cache, hour) DO UPDATE SET ${column} = ${column} + 1`,
        cache,
        hour,
      );
      if (person !== null) {
        this.person(cache, hour, person);
      }
      this.closeHour(nowMs);
    });
  }

  /** Relève la taille rangée du cache ; le dernier relevé de l'heure l'emporte. */
  size(cache: string, size: CacheSize, nowMs: number): void {
    this.safely(() => {
      this.sql.exec(
        "INSERT INTO metrics_hourly (cache, hour, bytes, entries) VALUES (?, ?, ?, ?) " +
          "ON CONFLICT(cache, hour) DO UPDATE SET bytes = excluded.bytes, entries = excluded.entries",
        cache,
        hourOf(nowMs),
        size.bytes,
        size.entries,
      );
    });
  }

  /** Les heures depuis `sinceMs`. Ne lève pas : vide en panne. */
  read(sinceMs: number): CacheMetricsReply {
    try {
      const current = this.seconds.current();
      if (current !== null) {
        this.peak(current.secondMs, current.requests);
      }
      return { rows: this.rows(sinceMs), peaks: this.peaks(sinceMs) };
    } catch (error) {
      this.once(error);
      return { rows: [], peaks: [] };
    }
  }

  private rows(sinceMs: number): readonly CacheMetricsRow[] {
    return this.sql
      .exec<StoredRow>(
        "SELECT cache, hour, hits, misses, stores, too_large, bytes, entries, persons " +
          "FROM metrics_hourly WHERE hour >= ? ORDER BY cache, hour",
        hourOf(sinceMs),
      )
      .toArray()
      .map((row) => ({
        cache: row.cache,
        hourMs: row.hour,
        hits: row.hits,
        misses: row.misses,
        stores: row.stores,
        tooLarge: row.too_large,
        bytes: row.bytes,
        entries: row.entries,
        persons: row.persons,
      }));
  }

  private peaks(sinceMs: number): CacheMetricsReply["peaks"] {
    return this.sql
      .exec<PeakRow>(
        "SELECT hour, per_second FROM object_peaks WHERE hour >= ? ORDER BY hour",
        hourOf(sinceMs),
      )
      .toArray()
      .map((row) => ({ hourMs: row.hour, perSecond: row.per_second }));
  }

  private person(cache: string, hour: number, person: string): void {
    this.sql.exec(
      "INSERT OR IGNORE INTO served_persons (cache, hour, person) VALUES (?, ?, ?)",
      cache,
      hour,
      person,
    );
    this.sql.exec(
      "UPDATE metrics_hourly SET persons = (SELECT COUNT(*) FROM served_persons " +
        "WHERE cache = ? AND hour = ?) WHERE cache = ? AND hour = ?",
      cache,
      hour,
      cache,
      hour,
    );
  }

  private peak(secondMs: number, requests: number): void {
    this.sql.exec(
      "INSERT INTO object_peaks (hour, per_second) VALUES (?, ?) " +
        "ON CONFLICT(hour) DO UPDATE SET per_second = MAX(per_second, excluded.per_second)",
      hourOf(secondMs),
      requests,
    );
  }

  /**
   * Une fois par heure et par instance : les empreintes des heures closes
   * sont vidées, et les heures de plus de 30 jours oubliées.
   */
  private closeHour(nowMs: number): void {
    const hour = hourOf(nowMs);
    if (hour === this.lastClosedHour) {
      return;
    }
    this.lastClosedHour = hour;
    this.sql.exec("DELETE FROM served_persons WHERE hour < ?", hour);
    this.sql.exec("DELETE FROM metrics_hourly WHERE hour < ?", oldestKeptHour(nowMs));
    this.sql.exec("DELETE FROM object_peaks WHERE hour < ?", oldestKeptHour(nowMs));
  }

  private safely(work: () => void): void {
    try {
      work();
    } catch (error) {
      this.once(error);
    }
  }

  private once(error: unknown): void {
    if (this.reported) {
      return;
    }
    this.reported = true;
    this.report(error);
  }
}

function defaultReport(error: unknown): void {
  console.error("Compteurs du cache indisponibles, la lecture continue sans eux", error);
}
