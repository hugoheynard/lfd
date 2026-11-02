import {
  DEFAULT_ORDER_CUTOFF_SETTINGS,
  nextFulfillmentDay,
  type OrderCutoffSettingsView,
  type OrderCutoffView,
  type PickupAddressView,
} from "@lfd/contracts";

import {
  catalogItem,
  saleOperationsOver,
} from "../../../catalog/application/__tests__/sale-operations-doubles.js";
import type { SellableOperation } from "../../../catalog/domain/ports/catalog-operations.reader.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { PickupAddressRepository } from "../../../pickup-addresses/domain/pickup-address.repository.js";
import { ClosedPlansReader } from "../../../../production/channels/commerce/index.js";
import { OrderCutoffSettingsReader } from "../../domain/order-cutoff-settings.reader.js";
import { OrderCutoffsInForce } from "../../domain/order-cutoffs-in-force.js";
import { type ShelfTodayQuestion, ShelfTodaySites } from "../../domain/shelf-today-sites.js";

/**
 * Le réglage « jour même », fixé par le test : un booléen l'ouvre (ou le
 * ferme) aux deux clientèles, en ligne comprise ; un objet règle chaque
 * réglage. Depuis le lot L4, `sameDayAllowed` n'est plus lu — il reste FERMÉ
 * ici pour le prouver.
 */
class SameDay extends OrderCutoffSettingsReader {
  constructor(private readonly allowed: boolean | Partial<OrderCutoffSettingsView>) {
    super();
  }
  current(): Promise<OrderCutoffSettingsView> {
    const all = typeof this.allowed === "boolean" ? this.allowed : false;
    return Promise.resolve({
      ...DEFAULT_ORDER_CUTOFF_SETTINGS,
      sameDayAllowed: false,
      sameDayPublicAllowed: all,
      sameDayProAllowed: all,
      sameDayProOnline: all,
      ...(typeof this.allowed === "boolean" ? {} : this.allowed),
    });
  }
}

/** Les points qui vendent aujourd'hui sur la vitrine, fixés par le test ; note les questions. */
class FixedShelfSites extends ShelfTodaySites {
  readonly asked: ShelfTodayQuestion[] = [];

  constructor(private readonly selling: readonly string[] = []) {
    super();
  }

  sellingToday(question: ShelfTodayQuestion): Promise<ReadonlySet<string>> {
    this.asked.push(question);
    return Promise.resolve(new Set(this.selling.filter((id) => question.siteIds.includes(id))));
  }
}
import { ListFulfillmentDaysHandler } from "../list-fulfillment-days.handler.js";
import { ListFulfillmentDaysQuery } from "../list-fulfillment-days.query.js";

/**
 * D6 : un panier qui porte une bûche ne se voit proposer que des jours de
 * retrait de son opération. Dates comparées à l'horloge figée du handler.
 */

const NOW = new Date("2026-12-01T10:00:00.000Z");

class FixedCutoffs extends OrderCutoffsInForce {
  constructor(private readonly rules: readonly OrderCutoffView[] = []) {
    super();
  }

  list(): Promise<readonly OrderCutoffView[]> {
    return Promise.resolve(this.rules);
  }
}

/** Les journées au plan arrêté ; note la plage demandée. */
class FixedClosedPlans extends ClosedPlansReader {
  readonly asked: { readonly from: string; readonly to: string }[] = [];

  constructor(private readonly closed: readonly string[] = []) {
    super();
  }

  closedBetween(from: string, to: string): Promise<readonly string[]> {
    this.asked.push({ from, to });
    return Promise.resolve(this.closed.filter((day) => from <= day && day <= to));
  }
}

class NoPoints extends PickupAddressRepository {
  constructor(private readonly points: readonly PickupAddressView[] = []) {
    super();
  }
  list(): Promise<readonly PickupAddressView[]> {
    return Promise.resolve(this.points);
  }
  resolve(): Promise<PickupAddressView | null> {
    return Promise.resolve(null);
  }
  create(): Promise<string> {
    return Promise.reject(new Error("écriture inattendue"));
  }
  update(): Promise<void> {
    return Promise.reject(new Error("écriture inattendue"));
  }
  remove(): Promise<void> {
    return Promise.reject(new Error("écriture inattendue"));
  }
  setDefault(): Promise<void> {
    return Promise.reject(new Error("écriture inattendue"));
  }
}

const NOEL: SellableOperation = {
  key: "noel-2026",
  name: { fr: "Noël" },
  lede: null,
  image: null,
  announceFrom: new Date("2026-11-01T00:00:00.000Z"),
  orderFrom: null,
  orderUntil: new Date("2026-12-21T11:00:00.000Z"),
  pickupFrom: "2026-12-20",
  pickupUntil: "2026-12-24",
  audience: "both",
  skus: ["PAT-002-1", "VIE-001-1"],
};

function handler(
  operations: readonly SellableOperation[] = [NOEL],
  over: {
    readonly rules?: readonly OrderCutoffView[];
    readonly plans?: FixedClosedPlans;
    readonly sameDayAllowed?: boolean | Partial<OrderCutoffSettingsView>;
    readonly points?: readonly PickupAddressView[];
    readonly shelf?: FixedShelfSites;
  } = {},
): ListFulfillmentDaysHandler {
  return new ListFulfillmentDaysHandler(
    new FixedCutoffs(over.rules),
    new NoPoints(over.points),
    new FixedClock(NOW),
    saleOperationsOver({
      now: NOW,
      operations,
      items: [catalogItem("PAT-002"), catalogItem("VIE-001")],
      onlySkus: ["PAT-002-1"],
    }),
    over.plans ?? new FixedClosedPlans(),
    // Le jour même OUVERT par défaut ici : ces cas parlent d'autre chose.
    new SameDay(over.sameDayAllowed ?? true),
    over.shelf ?? new FixedShelfSites(),
  );
}

describe("ListFulfillmentDaysHandler — les opérations datées", () => {
  it("sans panier, rend la journée des délais du commerce", async () => {
    expect(await handler().execute(new ListFulfillmentDaysQuery())).toEqual([
      { pickupAddressId: null, date: nextFulfillmentDay([], NOW), orderUntil: null },
    ]);
  });

  it("un panier d'articles courants de l'opération n'est pas contraint", async () => {
    const days = await handler().execute(new ListFulfillmentDaysQuery(["VIE-001-1"], "public"));
    expect(days[0]?.date).toBe(nextFulfillmentDay([], NOW));
  });

  it("un panier qui porte la bûche ne propose que les jours de retrait de Noël", async () => {
    const days = await handler().execute(
      new ListFulfillmentDaysQuery(["VIE-001-1", "PAT-002-1"], "public"),
    );
    expect(days).toEqual([{ pickupAddressId: null, date: "2026-12-20", orderUntil: null }]);
  });

  it("ne propose aucun jour quand l'opération n'est pas ouverte à cette clientèle", async () => {
    const days = await handler([{ ...NOEL, audience: "pro" }]).execute(
      new ListFulfillmentDaysQuery(["PAT-002-1"], "public"),
    );
    expect(days).toEqual([{ pickupAddressId: null, date: null, orderUntil: null }]);
  });
});

/**
 * Lot O3 (`plan-reglages-commandes.md`, §8, 2026-10-14) : la boutique ne
 * propose plus une journée dont le plan est arrêté — la passation la
 * refuserait. Horloge figée : `NOW` est le 1er décembre à 11 h à Paris.
 */
describe("ListFulfillmentDaysHandler — l'arrêt du plan", () => {
  const TODAY = "2026-12-01";
  const TOMORROW = "2026-12-02";

  it("sans règle en vigueur, saute aujourd'hui quand son plan est arrêté", async () => {
    const days = await handler([], { plans: new FixedClosedPlans([TODAY]) }).execute(
      new ListFulfillmentDaysQuery(),
    );
    expect(days).toEqual([{ pickupAddressId: null, date: TOMORROW, orderUntil: null }]);
  });

  it("saute plusieurs journées arrêtées d'affilée", async () => {
    const days = await handler([], { plans: new FixedClosedPlans([TODAY, TOMORROW]) }).execute(
      new ListFulfillmentDaysQuery(),
    );
    expect(days).toEqual([{ pickupAddressId: null, date: "2026-12-03", orderUntil: null }]);
  });

  it("compose avec la règle en vigueur : la plus tardive des deux bornes l'emporte", async () => {
    // La veille à 18:00 : à 11 h, demain est encore ouvert ; son plan arrêté le ferme.
    const veille: OrderCutoffView = {
      id: "c1",
      pickupAddressId: null,
      pickupLabel: null,
      weekday: null,
      daysBefore: 1,
      time: "18:00",
      graceMinutes: 0,
    };
    const days = await handler([], {
      rules: [veille],
      plans: new FixedClosedPlans([TOMORROW]),
    }).execute(new ListFulfillmentDaysQuery());
    // La limite annoncée est celle de la journée RENDUE : le 2 à 18 h Paris.
    expect(days).toEqual([
      { pickupAddressId: null, date: "2026-12-03", orderUntil: "2026-12-02T17:00:00.000Z" },
    ]);
  });

  it("lit les arrêts sur l'horizon de recherche, à partir d'aujourd'hui", async () => {
    const plans = new FixedClosedPlans();
    await handler([], { plans }).execute(new ListFulfillmentDaysQuery());
    expect(plans.asked).toEqual([{ from: TODAY, to: "2026-12-15" }]);
  });

  it("le jour même fermé par le réglage : propose demain, même sans règle", async () => {
    const days = await handler([], { sameDayAllowed: false }).execute(
      new ListFulfillmentDaysQuery(),
    );
    expect(days).toEqual([{ pickupAddressId: null, date: TOMORROW, orderUntil: null }]);
  });
});

/**
 * 2026-10-21 (Hugo, « prévenir AVANT trop tard pour demain ») : chaque journée
 * rendue porte l'heure limite ANNONCÉE. `NOW` : le 1er décembre, 11 h à Paris.
 */
describe("ListFulfillmentDaysHandler — l'heure limite annoncée", () => {
  const veille23h: OrderCutoffView = {
    id: "c1",
    pickupAddressId: null,
    pickupLabel: null,
    weekday: null,
    daysBefore: 1,
    time: "23:00",
    graceMinutes: 30,
  };

  it("rend la limite de la veille à 23 h pour demain, sans la grâce", async () => {
    const days = await handler([], { rules: [veille23h] }).execute(new ListFulfillmentDaysQuery());
    // Le 1er décembre à 23 h Paris (heure d'hiver) : 22:00Z.
    expect(days).toEqual([
      { pickupAddressId: null, date: "2026-12-02", orderUntil: "2026-12-01T22:00:00.000Z" },
    ]);
  });

  /**
   * Les règles par point × jour sont retirées (Hugo, 2026-10-21) : un
   * mercredi « deux jours avant » résiduel aurait fermé le 2 décembre et
   * poussé la journée au 3. Il est ignoré.
   */
  it("ignore une règle résiduelle d'un jour de semaine", async () => {
    const mercredi: OrderCutoffView = { ...veille23h, id: "wed", weekday: "wed", daysBefore: 2 };
    const days = await handler([], { rules: [mercredi, veille23h] }).execute(
      new ListFulfillmentDaysQuery(),
    );
    expect(days).toEqual([
      { pickupAddressId: null, date: "2026-12-02", orderUntil: "2026-12-01T22:00:00.000Z" },
    ]);
  });

  it("rend la limite du jour d'opération quand le panier déplace la journée", async () => {
    const days = await handler([NOEL], { rules: [veille23h] }).execute(
      new ListFulfillmentDaysQuery(["PAT-002-1"], "public"),
    );
    expect(days).toEqual([
      { pickupAddressId: null, date: "2026-12-20", orderUntil: "2026-12-19T22:00:00.000Z" },
    ]);
  });
});

/** Un point de retrait, sans heure déclarée : `FixedShelfSites` décide pour lui. */
function point(id: string): PickupAddressView {
  return {
    id,
    label: id,
    ligne1: "1 rue du Four",
    ligne2: "",
    codePostal: "73150",
    ville: "Val d'Isère",
    pays: "France",
    discounts: { b2b: null, b2c: null },
    opening: { publicOpening: null, proPickup: null },
  };
}

/**
 * Lot L4 du circuit du jour J (`plan-jour-meme-sur-stock.md`, §3, §14) : un
 * plan d'aujourd'hui arrêté n'éteint plus aujourd'hui partout — un point qui
 * vend encore sur sa vitrine le propose, sans heure limite. `NOW` : le 1er
 * décembre, 11 h à Paris.
 */
describe("ListFulfillmentDaysHandler — aujourd'hui sur la vitrine (L4)", () => {
  const TODAY = "2026-12-01";
  const TOMORROW = "2026-12-02";

  it("propose aujourd'hui au point qui vend encore, demain aux autres et à la livraison", async () => {
    const shelf = new FixedShelfSites(["village"]);
    const days = await handler([], {
      plans: new FixedClosedPlans([TODAY]),
      sameDayAllowed: { sameDayPublicAllowed: true },
      points: [point("village"), point("labo")],
      shelf,
    }).execute(new ListFulfillmentDaysQuery(["VIE-001-1"], "public"));

    expect(days).toEqual([
      { pickupAddressId: null, date: TOMORROW, orderUntil: null },
      { pickupAddressId: "village", date: TODAY, orderUntil: null },
      { pickupAddressId: "labo", date: TOMORROW, orderUntil: null },
    ]);
    expect(shelf.asked).toEqual([
      { day: TODAY, audience: "public", siteIds: ["village", "labo"], cartSkus: ["VIE-001-1"] },
    ]);
  });

  it("ne demande rien à la vitrine quand la clientèle n'y a pas droit", async () => {
    const shelf = new FixedShelfSites(["village"]);
    const days = await handler([], {
      plans: new FixedClosedPlans([TODAY]),
      // Les pros, mais pas en ligne : au comptoir seulement.
      sameDayAllowed: { sameDayProAllowed: true },
      points: [point("village")],
      shelf,
    }).execute(new ListFulfillmentDaysQuery([], "pro"));

    expect(days.map((day) => day.date)).toEqual([TOMORROW, TOMORROW]);
    expect(shelf.asked).toEqual([]);
  });

  it("plan d'aujourd'hui ouvert : aujourd'hui se fabrique, la vitrine n'est pas lue", async () => {
    const shelf = new FixedShelfSites(["village"]);
    const days = await handler([], {
      sameDayAllowed: { sameDayPublicAllowed: true },
      points: [point("village")],
      shelf,
    }).execute(new ListFulfillmentDaysQuery());

    expect(days.map((day) => day.date)).toEqual([TODAY, TODAY]);
    expect(shelf.asked).toEqual([]);
  });

  it("un panier tenu à d'autres jours n'est pas proposé aujourd'hui, même en vitrine", async () => {
    const days = await handler([NOEL], {
      plans: new FixedClosedPlans([TODAY]),
      points: [point("village")],
      shelf: new FixedShelfSites(["village"]),
    }).execute(new ListFulfillmentDaysQuery(["PAT-002-1"], "public"));

    expect(days.map((day) => day.date)).toEqual(["2026-12-20", "2026-12-20"]);
  });
});
