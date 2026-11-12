import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import {
  HOUR_MS,
  METRICS_KEEP_DAYS,
  type MetricsSql,
  type MetricsSqlValue,
} from "../cache-metrics-store";
import { HourlyCacheMetrics } from "../hourly-cache-metrics";

/**
 * La table horaire des objets partagés, sur une VRAIE base SQLite (celle de
 * Node, de la même forme que le stockage d'un Durable Object). Ces tests
 * échouent si un compteur se perd, si une personne compte deux fois dans
 * l'heure, si une empreinte survit à son heure, si une heure de plus de
 * 30 jours reste, ou si une panne de comptage remonte à la lecture.
 */
class NodeSql implements MetricsSql {
  readonly db = new DatabaseSync(":memory:");

  exec<T extends Record<string, MetricsSqlValue>>(
    query: string,
    ...bindings: MetricsSqlValue[]
  ): { toArray(): T[] } {
    const statement = this.db.prepare(query);
    const values = bindings.map((value): SQLInputValue =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    );
    if (/^\s*select/iu.test(query)) {
      const rows = statement.all(...values).map((row) => normalised<T>(row));
      return { toArray: () => rows };
    }
    statement.run(...values);
    return { toArray: () => [] };
  }
}

function normalised<T extends Record<string, MetricsSqlValue>>(row: object): T {
  const out: Record<string, MetricsSqlValue> = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = typeof value === "bigint" ? Number(value) : (value as MetricsSqlValue);
  }
  return out as T;
}

class ThrowingSql implements MetricsSql {
  exec<T extends Record<string, MetricsSqlValue>>(): { toArray(): T[] } {
    throw new Error("stockage indisponible");
  }
}

/** Une heure ronde, loin de toute frontière de jour : seule l'arithmétique relative compte. */
const NOW = 1000 * HOUR_MS;
const PERSON_A = "a".repeat(64);
const PERSON_B = "b".repeat(64);

describe("HourlyCacheMetrics", () => {
  it("compte réussites, ratés, rangements et refus par cache et par heure", () => {
    const metrics = new HourlyCacheMetrics(new NodeSql());

    metrics.count("pim-product", "hit", NOW);
    metrics.count("pim-product", "hit", NOW + 10);
    metrics.count("pim-product", "miss", NOW + 20);
    metrics.count("pim-product", "store", NOW + 30);
    metrics.count("pim-product", "too_large", NOW + 40);
    metrics.count("pim-product", "hit", NOW + HOUR_MS);
    metrics.count("catalog-admin", "miss", NOW);

    const { rows } = metrics.read(NOW);
    expect(rows).toEqual([
      expect.objectContaining({ cache: "catalog-admin", hourMs: NOW, misses: 1 }),
      expect.objectContaining({
        cache: "pim-product",
        hourMs: NOW,
        hits: 2,
        misses: 1,
        stores: 1,
        tooLarge: 1,
        bytes: null,
      }),
      expect.objectContaining({ cache: "pim-product", hourMs: NOW + HOUR_MS, hits: 1 }),
    ]);
  });

  it("garde le dernier relevé de taille de l'heure", () => {
    const metrics = new HourlyCacheMetrics(new NodeSql());

    metrics.size("pro-shelves", { bytes: 100, entries: 1 }, NOW);
    metrics.count("pro-shelves", "store", NOW + 1);
    metrics.size("pro-shelves", { bytes: 250, entries: 2 }, NOW + 2);

    expect(metrics.read(NOW).rows).toEqual([
      expect.objectContaining({ stores: 1, bytes: 250, entries: 2 }),
    ]);
  });

  it("compte une personne une fois par heure, et pas un appel sans personne", () => {
    const sql = new NodeSql();
    const metrics = new HourlyCacheMetrics(sql);

    metrics.count("day-versions", "hit", NOW, PERSON_A);
    metrics.count("day-versions", "miss", NOW + 1, PERSON_A);
    metrics.count("day-versions", "hit", NOW + 2, PERSON_B);
    metrics.count("day-versions", "hit", NOW + 3, null);
    metrics.count("day-versions", "hit", NOW + HOUR_MS, PERSON_A);

    const rows = metrics.read(NOW).rows;
    expect(rows.map((row) => row.persons)).toEqual([2, 1]);
    // Seules les empreintes de l'heure en cours restent.
    const kept = sql.db.prepare("SELECT hour FROM served_persons").all();
    expect(kept.map((row) => Number(row["hour"]))).toEqual([NOW + HOUR_MS]);
  });

  it("garde le pic de requêtes par seconde de chaque heure", () => {
    const metrics = new HourlyCacheMetrics(new NodeSql());

    for (const at of [0, 100, 200, 1000, 1500, 2000]) {
      metrics.request(NOW + at);
    }
    metrics.request(NOW + HOUR_MS);

    expect(metrics.read(NOW).peaks).toEqual([
      { hourMs: NOW, perSecond: 3 },
      { hourMs: NOW + HOUR_MS, perSecond: 1 },
    ]);
  });

  it(`oublie les heures de plus de ${METRICS_KEEP_DAYS} jours`, () => {
    const metrics = new HourlyCacheMetrics(new NodeSql());
    const old = NOW - (METRICS_KEEP_DAYS * 24 + 1) * HOUR_MS;
    const kept = NOW - (METRICS_KEEP_DAYS * 24 - 1) * HOUR_MS;

    metrics.count("pim-list", "hit", old);
    metrics.request(old);
    metrics.count("pim-list", "hit", kept);
    metrics.request(NOW);
    metrics.count("pim-list", "hit", NOW);

    const reply = metrics.read(0);
    expect(reply.rows.map((row) => row.hourMs)).toEqual([kept, NOW]);
    expect(reply.peaks.map((row) => row.hourMs)).toEqual([NOW]);
  });

  it("ne lève jamais, et ne journalise la panne qu'une fois", () => {
    const reported: unknown[] = [];
    const metrics = new HourlyCacheMetrics(new ThrowingSql(), (error) => reported.push(error));

    expect(() => {
      metrics.request(NOW);
      metrics.count("pim-product", "hit", NOW, PERSON_A);
      metrics.size("pim-product", { bytes: 1, entries: 1 }, NOW);
    }).not.toThrow();
    expect(metrics.read(NOW)).toEqual({ rows: [], peaks: [] });
    expect(reported).toHaveLength(1);
  });
});
