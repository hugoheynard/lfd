import { DatabaseSync, type SQLInputValue } from "node:sqlite";

import { CONTENT_MAX_BYTES } from "../versioned-contents-store";
import type { MetricsSql, MetricsSqlValue } from "../cache-metrics-store";
import {
  DAY_CONTENT_ABSENT,
  DAY_CONTENT_ABSENT_HEADER,
  DAY_CONTENT_KEPT_STATUS,
  DayContentsTable,
} from "../day-contents";
import {
  type DayContentCall,
  dayContentKeyOf,
  parseDayContentCall,
  parseDayContentTag,
  replacesDayContent,
  servesDayContent,
} from "../day-contents-store";
import { HourlyCacheMetrics } from "../hourly-cache-metrics";

/**
 * Les contenus des écrans de journée (`le-cache-du-back-office.md`, § 3.1),
 * sur une VRAIE base SQLite. Ces tests échouent si l'on sert une autre
 * étiquette que celle demandée, si une lecture plus ancienne écrase une plus
 * récente, si une journée de plus de trois jours survit à un rangement, ou si
 * l'on range au-delà du plafond.
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
const DAY = "2030-03-12";

function call(method: string, tag: string, day = DAY, revision = "r1", screen = "worksheet") {
  const parsed = parseDayContentCall(
    method,
    new URL(`${BASE}/day-contents/${screen}/${day}?revision=${revision}&tag=${tag}`),
  );
  if (parsed === null) {
    throw new Error(`appel non compris : ${method} ${tag}`);
  }
  return parsed;
}

function around() {
  const sql = new NodeSql();
  const metrics = new HourlyCacheMetrics(sql);
  const table = new DayContentsTable(sql, metrics);
  const store = (c: DayContentCall, bytes: number[]) =>
    table.answer(c, new Uint8Array(bytes), bytes.length, NOW_MS, null).status;
  const read = (c: DayContentCall) => table.answer(c, null, null, NOW_MS, null);
  const keys = () =>
    sql
      .exec<{ key: string }>("SELECT key FROM day_contents ORDER BY key")
      .toArray()
      .map((row) => row.key);
  return { table, metrics, store, read, keys };
}

describe("objet des journées — l'étiquette d'un contenu de journée", () => {
  it("comprend une lecture et un rangement, révision, écran et journée dans la clé", () => {
    expect(call("GET", "orders:3.production:7")).toEqual({
      kind: "day-content-read",
      key: dayContentKeyOf("r1", "worksheet", DAY),
      screen: "worksheet",
      day: DAY,
      tag: "orders:3.production:7",
    });
    expect(call("PUT", "orders:3").kind).toBe("day-content-store");
  });

  it("refuse un appel mal formé ou une étiquette non canonique", () => {
    const bad = [
      `/day-contents/worksheet/${DAY}?tag=orders:1`,
      `/day-contents/worksheet/${DAY}?revision=r`,
      `/day-contents/worksheet/2030-02-30?revision=r&tag=orders:1`,
      `/day-contents/Fiche/${DAY}?revision=r&tag=orders:1`,
      `/day-contents/worksheet/${DAY}?revision=r&tag=production:1.orders:2`,
      `/day-contents/worksheet/${DAY}?revision=r&tag=orders:1.orders:2`,
      `/day-contents/worksheet/${DAY}?revision=r&tag=orders:-1`,
      `/day-contents/worksheet/${DAY}?revision=r&tag=`,
    ];
    for (const path of bad) {
      expect(parseDayContentCall("GET", new URL(`${BASE}${path}`))).toBeNull();
    }
    expect(
      parseDayContentCall("DELETE", new URL(`${BASE}/day-contents/w/${DAY}?revision=r&tag=a:1`)),
    ).toBeNull();
  });

  it("lit les numéros en clair, par sujet", () => {
    expect(parseDayContentTag("delivery:2.orders:9")).toEqual(
      new Map([
        ["delivery", 2],
        ["orders", 9],
      ]),
    );
  });

  it("ne sert que l'étiquette EXACTE", () => {
    expect(servesDayContent("orders:3", "orders:3")).toBe(true);
    expect(servesDayContent("orders:3", "orders:4")).toBe(false);
    expect(servesDayContent(null, "orders:3")).toBe(false);
  });

  it("ne remplace que par une étiquette qui domine sujet par sujet", () => {
    expect(replacesDayContent(null, "a:1.b:1")).toBe(true);
    expect(replacesDayContent("a:1.b:1", "a:2.b:1")).toBe(true);
    expect(replacesDayContent("a:1.b:1", "a:1.b:1")).toBe(true);
    expect(replacesDayContent("a:2.b:1", "a:1.b:1")).toBe(false);
    // Incomparables : la ligne gardée reste, la prochaine lecture dominera les deux.
    expect(replacesDayContent("a:2.b:1", "a:1.b:2")).toBe(false);
    expect(replacesDayContent("a:1", "a:2.b:1")).toBe(false);
  });
});

describe("objet des journées — la table des contenus de journée", () => {
  it("sert la charge à étiquette égale, et un raté sur une autre", () => {
    const { store, read } = around();
    expect(store(call("PUT", "orders:3.production:7"), [1, 2, 3])).toBe(201);

    const hit = read(call("GET", "orders:3.production:7"));
    expect(hit.status).toBe(200);
    expect(new Uint8Array(hit.body as ArrayBuffer)).toEqual(new Uint8Array([1, 2, 3]));
    expect(read(call("GET", "orders:4.production:7")).status).toBe(404);
    expect(read(call("GET", "orders:3.production:7", DAY, "r2")).status).toBe(404);
  });

  it("une étiquette plus ancienne n'écrase pas la ligne gardée", () => {
    const { store, read } = around();
    store(call("PUT", "orders:5.production:7"), [5]);

    expect(store(call("PUT", "orders:4.production:7"), [4])).toBe(DAY_CONTENT_KEPT_STATUS);
    expect(read(call("GET", "orders:5.production:7")).status).toBe(200);
    expect(read(call("GET", "orders:4.production:7")).status).toBe(404);
  });

  it("une étiquette incomparable n'écrase pas ; une qui domine, si", () => {
    const { store, read } = around();
    store(call("PUT", "orders:5.production:7"), [5]);

    expect(store(call("PUT", "orders:4.production:8"), [4])).toBe(DAY_CONTENT_KEPT_STATUS);
    expect(store(call("PUT", "orders:5.production:8"), [6])).toBe(201);
    expect(read(call("GET", "orders:5.production:8")).status).toBe(200);
  });

  it("oublie au rangement, sur l'horloge de l'objet, les journées d'avant aujourd'hui − 3, et l'autre révision", () => {
    const { table, keys } = around();
    // L'horloge de l'objet est « le 12 » ; les journées sont relatives à elle.
    const today = Date.UTC(2030, 2, 12);
    const put = (tag: string, day: string, revision = "r1", screen = "worksheet") =>
      table.answer(call("PUT", tag, day, revision, screen), new Uint8Array([1]), 1, today, null);
    put("orders:1", "2030-03-08"); // J−4 : oubliée
    put("orders:1", "2030-03-09"); // J−3 : gardée
    put("orders:1", DAY, "r0");
    put("orders:1", DAY, "r1", "packing");

    put("orders:2", DAY);
    put("orders:1", "2030-03-19"); // J+7 : n'efface pas aujourd'hui

    expect(keys()).toEqual(
      [
        dayContentKeyOf("r1", "packing", DAY),
        dayContentKeyOf("r1", "worksheet", "2030-03-09"),
        dayContentKeyOf("r1", "worksheet", DAY),
        dayContentKeyOf("r1", "worksheet", "2030-03-19"),
      ].sort(),
    );
  });

  /** Régression : une journée de plus de trois jours était rangée (201) puis effacée dans le même appel. */
  it("ne range pas une journée que le ménage oublierait aussitôt : 202, rien d'écrit, compté trop vieux", () => {
    const { table, metrics, keys } = around();
    const today = Date.UTC(2030, 2, 12);
    const old = call("PUT", "orders:1", "2030-03-08"); // J−4

    const reply = table.answer(old, new Uint8Array([1]), 1, today, null);

    expect(reply.status).toBe(DAY_CONTENT_KEPT_STATUS);
    expect(keys()).toEqual([]);
    expect(metrics.read(0).rows).toEqual([
      expect.objectContaining({ cache: "day-worksheet", tooOld: 1, stores: 0 }),
    ]);
  });

  it("refuse une charge au-delà du plafond ou vide (413), et ne la range pas", () => {
    const { table, read } = around();
    const tooBig = new Uint8Array(CONTENT_MAX_BYTES + 1);

    expect(table.answer(call("PUT", "orders:1"), tooBig, null, NOW_MS, null).status).toBe(413);
    expect(table.answer(call("PUT", "orders:1"), new Uint8Array(), null, NOW_MS, null).status).toBe(
      413,
    );
    expect(read(call("GET", "orders:1")).status).toBe(404);
  });

  it("compte sous `day-<écran>` dans l'onglet Cache", () => {
    const { metrics, store, read } = around();
    store(call("PUT", "orders:1"), [1, 2]);
    read(call("GET", "orders:1"));
    read(call("GET", "orders:2"));

    const [row] = metrics.read(0).rows.filter((r) => r.cache === "day-worksheet");
    expect(row).toMatchObject({ hits: 1, misses: 1, stores: 1, bytes: 2, entries: 1, rawBytes: 2 });
  });

  it("signe son propre 404 de lecture, pour que l'API le distingue d'un appel non aiguillé", async () => {
    const { table } = around();
    const asked = call("GET", "orders:1");

    const missed = await table.respond(asked, new Request(BASE), NOW_MS);

    expect(missed.status).toBe(404);
    expect(missed.headers.get(DAY_CONTENT_ABSENT_HEADER)).toBe(DAY_CONTENT_ABSENT);
  });
});
