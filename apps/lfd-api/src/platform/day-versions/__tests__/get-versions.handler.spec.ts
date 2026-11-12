import { GLOBAL_SCOPE } from "../day-versions-cache.js";
import { DAY_VERSIONS_FRESH_MS } from "../day-versions-card.js";
import { VersionsDayMissingError } from "../get-versions.handler.js";
import { GetVersionsQuery } from "../get-versions.query.js";
import {
  ALL_ORDERS_FRESH_MS,
  COMPANIES_FRESH_MS,
  globalSources,
  handlerAround,
  settle,
  sources,
} from "./day-versions-doubles.js";

// Une journée comparée à rien : aucune horloge n'est lue.
const DAY = "2030-03-12";

function around() {
  const days = sources();
  const globals = globalSources();
  return { days, globals, ...handlerAround(Object.values(days), Object.values(globals)) };
}

describe("GetVersionsHandler — une porte pour les sujets journaliers et globaux", () => {
  it("rend journaliers et globaux mêlés, en une réponse", async () => {
    const { versions } = around();

    const view = await versions.execute(
      new GetVersionsQuery(
        DAY,
        ["orders", "companies", "orders-all"],
        ["b2b_orders:read", "b2b_companies:read"],
      ),
    );

    expect(view).toEqual({
      date: DAY,
      versions: { orders: 7, companies: 100, "orders-all": 200 },
    });
  });

  it("sans sujet journalier, ne lit aucune journée et rend `date: null`", async () => {
    const { versions, days, cache } = around();

    const view = await versions.execute(
      new GetVersionsQuery(null, ["companies"], ["b2b_companies:read"]),
    );
    await settle();

    expect(view).toEqual({ date: null, versions: { companies: 100 } });
    expect(days.orders.asked).toEqual([]);
    expect([...cache.cards.keys()]).toEqual([GLOBAL_SCOPE]);
  });

  it("refuse un sujet journalier sans journée", async () => {
    const { versions } = around();

    await expect(
      versions.execute(new GetVersionsQuery(null, ["orders"], ["b2b_orders:read"])),
    ).rejects.toBeInstanceOf(VersionsDayMissingError);
  });
});

describe("GetVersionsHandler — le droit, sujet par sujet", () => {
  it("`companies` ne s'ouvre qu'à `b2b_companies:read`", async () => {
    const { versions } = around();

    const view = await versions.execute(
      new GetVersionsQuery(null, ["companies", "orders-all"], ["b2b_orders:read"]),
    );

    expect(view.versions).toEqual({ "orders-all": 200 });
  });

  /** Le comptoir et la Supervision lisent `orders` ; jamais toutes les journées. */
  it("🔴 `orders-all` ne s'ouvre PAS aux lecteurs du journal `orders` du comptoir et de la Supervision", async () => {
    const { versions } = around();

    const view = await versions.execute(
      new GetVersionsQuery(
        DAY,
        ["orders", "orders-all"],
        ["handover_counter:read", "b2b_supervision:read"],
      ),
    );

    expect(view.versions).toEqual({ orders: 7 });
  });

  it("un sujet non permis n'est pas lu du tout quand rien de sa portée n'est permis", async () => {
    const { versions, globals } = around();

    await versions.execute(new GetVersionsQuery(DAY, ["orders", "companies"], ["b2b_orders:read"]));

    expect(globals.companies.asked).toBe(0);
  });

  it("la carte rangée contient tous les sujets de sa portée, même lue pour un poste limité", async () => {
    const { versions, cache } = around();

    await versions.execute(new GetVersionsQuery(null, ["orders-all"], ["b2b_orders:read"]));
    await settle();

    expect(Object.keys(cache.cards.get(GLOBAL_SCOPE)?.subjects ?? {})).toEqual([
      "companies",
      "orders-all",
    ]);
  });
});

describe("GetVersionsHandler — une fenêtre par sujet", () => {
  const ALL = ["b2b_orders:read", "b2b_companies:read"] as const;

  it("un sujet à 30 s n'est pas relu quand un sujet à 15 s l'est", async () => {
    const { versions, globals, wall } = around();
    await versions.execute(new GetVersionsQuery(null, ["companies", "orders-all"], ALL));
    await settle();
    globals.companies.version = 101;
    globals["orders-all"].version = 201;
    wall.advanceMs(ALL_ORDERS_FRESH_MS);

    const view = await versions.execute(
      new GetVersionsQuery(null, ["companies", "orders-all"], ALL),
    );

    expect(view.versions).toEqual({ companies: 100, "orders-all": 201 });
    expect(globals.companies.asked).toBe(1);
    expect(globals["orders-all"].asked).toBe(2);
  });

  it("ne range QUE les sujets relus, que l'objet fusionne à sa carte", async () => {
    const { versions, wall, cache } = around();
    await versions.execute(new GetVersionsQuery(null, ["companies"], ALL));
    await settle();
    wall.advanceMs(ALL_ORDERS_FRESH_MS);

    await versions.execute(new GetVersionsQuery(null, ["companies"], ALL));
    await settle();

    expect(cache.stored.map((one) => Object.keys(one.card.subjects))).toEqual([
      ["companies", "orders-all"],
      ["orders-all"],
    ]);
    expect(Object.keys(cache.cards.get(GLOBAL_SCOPE)?.subjects ?? {})).toEqual([
      "companies",
      "orders-all",
    ]);
  });

  it("relit `companies` passé SA fenêtre", async () => {
    const { versions, globals, wall } = around();
    await versions.execute(new GetVersionsQuery(null, ["companies"], ALL));
    await settle();
    globals.companies.version = 101;
    wall.advanceMs(COMPANIES_FRESH_MS);

    const view = await versions.execute(new GetVersionsQuery(null, ["companies"], ALL));

    expect(view.versions).toEqual({ companies: 101 });
  });

  it("la carte d'une journée et la carte globale sont deux cartes", async () => {
    const { versions, wall, days, globals } = around();
    await versions.execute(new GetVersionsQuery(DAY, ["orders", "orders-all"], ALL));
    await settle();
    wall.advanceMs(DAY_VERSIONS_FRESH_MS - 1);

    await versions.execute(new GetVersionsQuery(DAY, ["orders", "orders-all"], ALL));

    expect(days.orders.asked).toEqual([DAY]);
    expect(globals["orders-all"].asked).toBe(1);
  });
});
