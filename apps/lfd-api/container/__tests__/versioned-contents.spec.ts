import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import type { MetricsSql, MetricsSqlValue } from "../cache-metrics-store";
import { HourlyCacheMetrics } from "../hourly-cache-metrics";
import { VersionedContentsTable } from "../versioned-contents";
import { CONTENT_MAX_BYTES, type ContentCall, parseContentCall } from "../versioned-contents-store";

/**
 * La table `contents` de l'objet des journées (`le-cache-du-back-office.md`,
 * § 3), sur une VRAIE base SQLite. Ces tests échouent si l'on sert un autre
 * numéro que celui demandé, si les lignes d'une autre révision du code
 * survivent à un rangement, ou si la taille en clair n'est pas relevée.
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

const BASE = "http://objets.interne";
const NOW_MS = 1_000;

function call(method: string, key: string, version: number, revision = "r1"): ContentCall {
  const parsed = parseContentCall(
    method,
    new URL(`${BASE}/contents/${encodeURIComponent(key)}?revision=${revision}&version=${version}`),
  );
  if (parsed === null) {
    throw new Error(`appel non compris : ${method} ${key}`);
  }
  return parsed;
}

function around() {
  const sql = new NodeSql();
  const metrics = new HourlyCacheMetrics(sql);
  const table = new VersionedContentsTable(sql, metrics);
  const answer = (c: ContentCall, body: Uint8Array | null, rawBytes: number | null = null) =>
    table.answer(c, body, { cache: "pim-product", rawBytes, nowMs: NOW_MS, person: null });
  const keys = () =>
    sql
      .exec<{ key: string }>("SELECT key FROM contents ORDER BY key")
      .toArray()
      .map((row) => row.key);
  return { sql, metrics, answer, keys };
}

describe("objet des journées — la table des contenus versionnés", () => {
  it("sert une charge à numéro égal, et rien sous un autre numéro", () => {
    const { answer } = around();
    answer(call("PUT", "pim-product:1", 4), new Uint8Array([1, 2]));

    expect(answer(call("GET", "pim-product:1", 4), null).status).toBe(200);
    expect(answer(call("GET", "pim-product:1", 5), null).status).toBe(404);
  });

  it("efface au rangement les lignes de toute autre révision du code", () => {
    const { answer, keys } = around();
    answer(call("PUT", "pim-product:1", 1, "ancienne"), new Uint8Array([1]));
    answer(call("PUT", "catalog-admin", 1, "ancienne"), new Uint8Array([1]));
    answer(call("PUT", "pim-product:2", 1, "r1"), new Uint8Array([1]));
    answer(call("PUT", "pim-product:1", 1, "r1"), new Uint8Array([1]));

    expect(keys()).toEqual(["r:r1/pim-product:1", "r:r1/pim-product:2"]);
  });

  it("ne confond pas une révision avec une autre qui la prolonge", () => {
    const { answer, keys } = around();
    answer(call("PUT", "pim-product:1", 1, "r1x"), new Uint8Array([1]));
    answer(call("PUT", "pim-product:1", 1, "r1"), new Uint8Array([1]));

    expect(keys()).toEqual(["r:r1/pim-product:1"]);
  });

  it("refuse au-delà du plafond (413) sans écrire ni effacer", () => {
    const { answer, keys } = around();
    answer(call("PUT", "pim-product:1", 1, "ancienne"), new Uint8Array([1]));

    const reply = answer(call("PUT", "pim-product:1", 1), new Uint8Array(CONTENT_MAX_BYTES + 1));

    expect(reply.status).toBe(413);
    expect(keys()).toEqual(["r:ancienne/pim-product:1"]);
  });

  it("relève la taille rangée et la taille en clair du cache", () => {
    const { answer, metrics } = around();
    answer(call("PUT", "pim-product:1", 1), new Uint8Array([1, 2, 3]), 30);
    answer(call("PUT", "pim-product:2", 1), new Uint8Array([1]), 10);
    answer(call("GET", "pim-product:2", 1), null);

    expect(metrics.read(0).rows).toEqual([
      expect.objectContaining({
        cache: "pim-product",
        stores: 2,
        hits: 1,
        bytes: 4,
        entries: 2,
        rawBytes: 40,
      }),
    ]);
  });

  it("ajoute la colonne de la taille en clair à une table créée avant elle", () => {
    const sql = new NodeSql();
    sql.exec(
      "CREATE TABLE contents (key TEXT PRIMARY KEY, version INTEGER NOT NULL, body TEXT NOT NULL)",
    );
    const metrics = new HourlyCacheMetrics(sql);
    const table = new VersionedContentsTable(sql, metrics);
    new VersionedContentsTable(sql, metrics);

    const reply = table.answer(call("PUT", "catalog-admin", 1), new Uint8Array([1]), {
      cache: "catalog-admin",
      rawBytes: 9,
      nowMs: NOW_MS,
      person: null,
    });

    expect(reply.status).toBe(201);
  });
});
