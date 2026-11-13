import { DAY_VERSIONS_FRESH_MS } from "../day-versions-card.js";
import { GetVersionsQuery } from "../get-versions.query.js";
import { DAY_VERSIONS_BREAKER_FAILURES } from "../resilient-day-versions-cache.js";
import { handlerAround, RecordingSource, settle, sources } from "./day-versions-doubles.js";

// Une journée comparée à rien : aucune horloge n'est lue.
const DAY = "2030-03-12";

const EVERYTHING = [
  "b2b_orders:read",
  "production_plan:read",
  "delivery_rounds:read",
  "delivery_driving:read",
] as const;

function everything(journals: GetVersionsQuery["subjects"]): GetVersionsQuery {
  return new GetVersionsQuery(DAY, journals, EVERYTHING);
}

describe("GetVersionsHandler, sujets journaliers — la porte unique des versions de journée", () => {
  it("rend la version de chaque journal demandé et permis, en une réponse", async () => {
    const { versions: handler } = handlerAround(Object.values(sources()));

    const view = await handler.execute(
      new GetVersionsQuery(
        DAY,
        ["orders", "production"],
        ["b2b_orders:read", "production_plan:read"],
      ),
    );

    expect(view).toEqual({ date: DAY, versions: { orders: 7, production: 42 } });
  });

  it("OMET un journal que l'appelant ne peut pas lire, sans refuser les autres", async () => {
    const { versions: handler } = handlerAround(Object.values(sources()));

    const view = await handler.execute(
      new GetVersionsQuery(DAY, ["orders", "production"], ["handover_counter:read"]),
    );

    expect(view).toEqual({ date: DAY, versions: { orders: 7 } });
  });

  it("rend une réponse vide à qui n'a aucun des droits, sans erreur", async () => {
    const { versions: handler } = handlerAround(Object.values(sources()));

    await expect(
      handler.execute(new GetVersionsQuery(DAY, ["delivery", "my-round"], ["b2b_orders:read"])),
    ).resolves.toEqual({ date: DAY, versions: {} });
  });

  it("fait échouer la réponse entière quand une source échoue : le veilleur ne relit rien", async () => {
    class BrokenSource extends RecordingSource {
      override versionOf(): Promise<number> {
        return Promise.reject(new RangeError("journal injoignable"));
      }
    }
    const all = sources();
    const { versions: handler, cache } = handlerAround([
      all.orders,
      new BrokenSource("production", ["production_plan:read"], 0),
      all.delivery,
      all["my-round"],
    ]);

    await expect(handler.execute(everything(["orders"]))).rejects.toThrow("journal injoignable");
    await settle();
    expect(cache.stores).toBe(0);
  });
});

describe("GetVersionsHandler, sujets journaliers — la carte complète, d'abord, puis le droit", () => {
  it("relit TOUS les journaux et range la carte complète, même pour un poste limité", async () => {
    const all = sources();
    const { versions: handler, cache, wall } = handlerAround(Object.values(all));

    await handler.execute(new GetVersionsQuery(DAY, ["orders"], ["handover_counter:read"]));
    await settle();

    expect(Object.values(all).map((source) => source.asked)).toEqual([[DAY], [DAY], [DAY], [DAY]]);
    const readAtMs = wall.elapsedNow().getTime();
    expect(cache.cards.get(DAY)).toEqual({
      subjects: {
        orders: { version: 7, readAtMs },
        production: { version: 42, readAtMs },
        delivery: { version: 3, readAtMs },
        "my-round": { version: 11, readAtMs },
      },
    });
  });

  it("un poste limité ne reçoit aucune clé non permise d'une carte qu'un autre a fait ranger", async () => {
    const { versions: handler, cache } = handlerAround(Object.values(sources()));
    await handler.execute(everything(["orders", "production", "delivery", "my-round"]));
    await settle();
    const readsBefore = cache.reads;

    const view = await handler.execute(
      new GetVersionsQuery(
        DAY,
        ["orders", "production", "delivery", "my-round"],
        ["handover_counter:read"],
      ),
    );

    expect(cache.reads).toBe(readsBefore + 1);
    expect(Object.keys(view.versions)).toEqual(["orders"]);
  });

  it("sert la carte FRAÎCHE de l'objet sans relire la base", async () => {
    const all = sources();
    const { versions: handler, wall } = handlerAround(Object.values(all));
    await handler.execute(everything(["orders"]));
    await settle();
    all.orders.version = 8;
    wall.advanceMs(DAY_VERSIONS_FRESH_MS - 1);

    const view = await handler.execute(everything(["orders"]));

    expect(view.versions).toEqual({ orders: 7 });
    expect(all.orders.asked).toEqual([DAY]);
  });

  it("relit la base quand la carte gardée est PÉRIMÉE, et range la nouvelle", async () => {
    const all = sources();
    const { versions: handler, wall, cache } = handlerAround(Object.values(all));
    await handler.execute(everything(["orders"]));
    await settle();
    all.orders.version = 8;
    wall.advanceMs(DAY_VERSIONS_FRESH_MS);

    const view = await handler.execute(everything(["orders"]));
    await settle();

    expect(view.versions).toEqual({ orders: 8 });
    expect(cache.versionOf(DAY, "orders")).toBe(8);
  });

  it("relit en base SEULS les journaux que la carte gardée ne nomme pas", async () => {
    const all = sources();
    const { versions: handler, cache, wall } = handlerAround(Object.values(all));
    cache.cards.set(DAY, {
      subjects: { orders: { version: 1, readAtMs: wall.elapsedNow().getTime() } },
    });

    const view = await handler.execute(everything(["orders"]));

    expect(view.versions).toEqual({ orders: 1 });
    expect(all.orders.asked).toEqual([]);
    expect(all.production.asked).toEqual([DAY]);
  });

  it("sans objet (raté permanent), lit la base à chaque question", async () => {
    const all = sources();
    const { versions: handler, cache } = handlerAround(Object.values(all));
    cache.cards.clear();
    const keepNothing = (): Promise<void> => Promise.resolve();
    cache.store = keepNothing;

    await handler.execute(everything(["orders"]));
    await handler.execute(everything(["orders"]));

    expect(all.orders.asked).toEqual([DAY, DAY]);
  });
});

describe("GetVersionsHandler, sujets journaliers — l'objet n'est jamais sur le chemin de la disponibilité", () => {
  it("objet injoignable : la base répond, et la porte aussi", async () => {
    const { versions: handler, cache } = handlerAround(Object.values(sources()));
    cache.behaviour = "throws";

    await expect(handler.execute(everything(["orders"]))).resolves.toEqual({
      date: DAY,
      versions: { orders: 7 },
    });
  });

  it("objet lent (au-delà du délai) : la base répond", async () => {
    const { versions: handler, cache, deadline } = handlerAround(Object.values(sources()));
    cache.behaviour = "hangs";
    deadline.late = true;

    await expect(handler.execute(everything(["production"]))).resolves.toEqual({
      date: DAY,
      versions: { production: 42 },
    });
  });

  it("disjoncteur ouvert : l'objet n'est plus appelé, la base répond", async () => {
    const { versions: handler, cache } = handlerAround(Object.values(sources()));
    cache.behaviour = "throws";
    for (let failure = 0; failure < DAY_VERSIONS_BREAKER_FAILURES; failure += 1) {
      await handler.execute(everything(["orders"]));
      await settle();
    }
    const readsBefore = cache.reads;

    await expect(handler.execute(everything(["orders"]))).resolves.toMatchObject({
      versions: { orders: 7 },
    });
    expect(cache.reads).toBe(readsBefore);
  });

  it("mesure ses appels sous `day_versions.round_trip`, pour la carte de santé", async () => {
    const { versions: handler, timings } = handlerAround(Object.values(sources()));

    await handler.execute(everything(["orders"]));
    await settle();

    expect(timings.recorded.map((one) => `${one.name}:${one.labels["operation"]}`)).toEqual([
      "day_versions.round_trip:read",
      "day_versions.round_trip:store",
    ]);
  });
});

describe("GetVersionsHandler, sujets journaliers — une seule relecture à la fois par journée", () => {
  it("N questions simultanées → UNE lecture de chaque source", async () => {
    const all = sources();
    const { versions: handler } = handlerAround(Object.values(all));
    for (const source of Object.values(all)) {
      source.hold();
    }

    const answers = Array.from({ length: 5 }, () => handler.execute(everything(["orders"])));
    await settle();
    for (const source of Object.values(all)) {
      source.release();
    }

    await expect(Promise.all(answers)).resolves.toEqual(
      Array.from({ length: 5 }, () => ({ date: DAY, versions: { orders: 7 } })),
    );
    expect(all.orders.asked).toEqual([DAY]);
    expect(all.delivery.asked).toEqual([DAY]);
  });

  it("une relecture finie libère la journée : la suivante, périmée, relit", async () => {
    const all = sources();
    const { versions: handler, wall } = handlerAround(Object.values(all));
    await handler.execute(everything(["orders"]));
    wall.advanceMs(DAY_VERSIONS_FRESH_MS);

    await handler.execute(everything(["orders"]));

    expect(all.orders.asked).toEqual([DAY, DAY]);
  });
});
