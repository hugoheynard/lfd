import {
  orderLine,
  producibleOrder,
} from "../../../../channels/commerce/__tests__/producible-order.fixture.js";
import type { ProducibleOrder } from "../../../../channels/commerce/day-orders.reader.js";
import { PlanVersionOutOfSequenceError } from "../../errors/plan-version-errors.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import {
  PlanVersion,
  type PlanVersionAuthor,
  type PlanVersionCause,
  type WithdrawalEntry,
} from "../plan-version.js";
import { ProductionDay } from "../production-day.js";
import type { ProductionDaySnapshot } from "../production-day.snapshot.js";

/**
 * La version du plan (`documentation/fournil/plan-historique-des-tirages.md`,
 * § 1.6 à 1.9) : comment chaque envoi est entré, ce qu'on garde, et quand il
 * n'y a rien à garder. Dates recopiées et comparées entre elles seulement —
 * exception étroite du §5.
 */

const DAY = ServiceDay.of("2026-11-28");
const EVENING = new Date("2026-11-27T18:00:00.000Z");
const NIGHT = new Date("2026-11-27T21:00:00.000Z");
const MORNING = new Date("2026-11-28T05:00:00.000Z");
const NONE = new Set<string>();
const IDLE = { packingStarted: false, dispatchStarted: false };
const MARIE: PlanVersionAuthor = { kind: "staff", staffId: "staff-1", name: "Marie Dupont" };
const SYSTEM: PlanVersionAuthor = { kind: "system" };

let counter = 0;
function stamp(at: Date = MORNING) {
  counter += 1;
  return { id: `v_${counter}`, at };
}

function order(orderId: string, overrides: Partial<ProducibleOrder> = {}): ProducibleOrder {
  return producibleOrder(orderId, overrides);
}

function closed(orders: readonly ProducibleOrder[], at: Date = EVENING): ProductionDay {
  const day = ProductionDay.open(DAY);
  day.close(orders, NONE, at, null);
  return day;
}

function next(
  previous: PlanVersion | null,
  snapshot: ProductionDaySnapshot,
  cause: PlanVersionCause,
  withdrawn: readonly WithdrawalEntry[] = [],
  by: PlanVersionAuthor = MARIE,
): PlanVersion | null {
  return PlanVersion.next(previous, snapshot, cause, withdrawn, by, stamp());
}

function versionOf(found: PlanVersion | null): PlanVersion {
  if (found === null) {
    throw new TypeError("une version était attendue");
  }
  return found;
}

function entries(version: PlanVersion): readonly string[] {
  return version.content.shipments.map((shipment) => `${shipment.orderId}:${shipment.entry}`);
}

describe("PlanVersion.next — `entry`", () => {
  it("le premier arrêt : chaque envoi est `arrested`, version 1, tirage 1", () => {
    const version = versionOf(next(null, closed([order("ord_1")]).toSnapshot(), "closed"));

    expect(version.version).toBe(1);
    expect(version.toRecord().printRun).toBe(1);
    expect(entries(version)).toEqual(["ord_1:arrested"]);
  });

  it.each<PlanVersionCause>(["auto_closed", "opened_by_resupply"])(
    "un arrêt « %s » sans version précédente : `arrested`",
    (cause) => {
      const version = versionOf(
        next(null, closed([order("ord_1")]).toSnapshot(), cause, [], SYSTEM),
      );

      expect(entries(version)).toEqual(["ord_1:arrested"]);
    },
  );

  it.each<PlanVersionCause>(["retaken", "order_revised", "order_withdrawn", "resupply_launched"])(
    "sans version précédente, un geste qui n'arrête pas (%s) : `unknown` — journée arrêtée avant les versions",
    (cause) => {
      const version = versionOf(next(null, closed([order("ord_1")]).toSnapshot(), cause));

      expect(entries(version)).toEqual(["ord_1:unknown"]);
    },
  );

  it("un retirage : l'envoi neuf est `retaken`, les autres `unchanged`", () => {
    const day = closed([order("ord_1")]);
    const first = versionOf(next(null, day.toSnapshot(), "closed"));

    day.retake([order("ord_1"), order("ord_2")], NONE, NIGHT, "staff-1", "Marie Dupont");
    const second = versionOf(next(first, day.toSnapshot(), "retaken"));

    expect(second.version).toBe(2);
    expect(second.toRecord().printRun).toBe(2);
    expect(entries(second)).toEqual(["ord_1:unchanged", "ord_2:retaken"]);
  });

  it("après une réouverture, le nouvel arrêt refige tout : `arrested_after_reopen`", () => {
    const day = closed([order("ord_1")]);
    const first = versionOf(next(null, day.toSnapshot(), "closed"));

    day.reopen(IDLE, NIGHT, "staff-1");
    day.close([order("ord_1"), order("ord_2")], NONE, MORNING, null);
    const second = versionOf(next(first, day.toSnapshot(), "closed"));

    expect(entries(second)).toEqual(["ord_1:arrested_after_reopen", "ord_2:arrested_after_reopen"]);
    expect(second.toRecord().closedAt).toEqual(MORNING);
  });

  it("un nouvel arrêt au plan identique est une version quand même : l'arrêt a changé", () => {
    const day = closed([order("ord_1")]);
    const first = versionOf(next(null, day.toSnapshot(), "closed"));

    day.reopen(IDLE, NIGHT, "staff-1");
    day.close([order("ord_1")], NONE, MORNING, null);

    expect(next(first, day.toSnapshot(), "closed")).not.toBeNull();
  });

  it("une révision : l'envoi déjà là reste `unchanged`, ses lignes disent le dû révisé", () => {
    const day = closed([order("ord_1", { lines: [orderLine("BAG", 10, "Baguette")] })]);
    const first = versionOf(next(null, day.toSnapshot(), "closed"));

    day.reviseOrder("ord_1", [{ sku: "BAG", quantity: 15 }]);
    const second = versionOf(next(first, day.toSnapshot(), "order_revised"));

    expect(entries(second)).toEqual(["ord_1:unchanged"]);
    expect(second.content.shipments[0]?.lines[0]?.quantity).toBe(15);
    expect(second.content.counts).toEqual([
      { sku: "BAG", productName: "Baguette", quantity: 15, saleUnit: "piece" },
    ]);
  });
});

describe("PlanVersion.next — le contenu", () => {
  it("garde `offPlan` tel qu'il est figé, `null` compris", () => {
    const snapshot = closed([
      order("ord_1", { offPlan: true }),
      order("ord_2", { offPlan: false }),
    ]).toSnapshot();
    const [, known] = snapshot.orders;
    if (known === undefined) {
      throw new TypeError("deux commandes attendues");
    }
    // Une commande figée avant la colonne : on ne savait pas.
    const legacy = { ...known, orderId: "ord_3", offPlan: null };

    const version = versionOf(
      next(null, { ...snapshot, orders: [...snapshot.orders, legacy] }, "closed"),
    );

    expect(version.content.shipments.map((shipment) => shipment.offPlan)).toEqual([
      true,
      false,
      null,
    ]);
  });

  it("un envoi par rang : une commande à deux envois a deux entrées, rangées par commande puis rang", () => {
    const snapshot = closed([order("ord_1")]).toSnapshot();
    const [first] = snapshot.orders;
    if (first === undefined) {
      throw new TypeError("une commande attendue");
    }
    const twoShipments = { ...snapshot, orders: [{ ...first, rank: 2 }, first] };

    const version = versionOf(next(null, twoShipments, "closed"));

    expect(version.content.shipments.map((shipment) => [shipment.orderId, shipment.rank])).toEqual([
      ["ord_1", 1],
      ["ord_1", 2],
    ]);
  });

  it("ne garde ni la destination ni le bon : le libellé du client seul", () => {
    const version = versionOf(next(null, closed([order("ord_1")]).toSnapshot(), "closed"));
    const [shipment] = version.content.shipments;

    expect(shipment).not.toHaveProperty("destination");
    expect(shipment).not.toHaveProperty("sheetDetails");
    expect(shipment?.customerLabel).toBe("Trois Ponts");
  });

  it("les retirées : un envoi par rang du plan, l'instant, et l'auteur du geste qui retire", () => {
    const day = closed([order("ord_1"), order("ord_2")]);
    const first = versionOf(next(null, day.toSnapshot(), "closed"));
    const customer: PlanVersionAuthor = { kind: "customer" };

    const second = versionOf(
      next(
        first,
        day.toSnapshot(),
        "order_withdrawn",
        [{ orderId: "ord_2", at: NIGHT, by: customer }],
        customer,
      ),
    );

    expect(second.content.withdrawn).toEqual([
      { orderId: "ord_2", rank: 1, at: NIGHT.toISOString(), by: customer },
    ]);
    // Le compte ne bouge pas : la retirée est toujours produite.
    expect(second.content.counts).toEqual(first.content.counts);
  });

  it("une retirée garde son auteur d'une version à l'autre, et son rang après le nouvel arrêt qui l'écarte", () => {
    const day = closed([order("ord_1"), order("ord_2")]);
    const first = versionOf(next(null, day.toSnapshot(), "closed"));
    const guest: PlanVersionAuthor = { kind: "guest" };
    const second = versionOf(
      next(
        first,
        day.toSnapshot(),
        "order_withdrawn",
        [{ orderId: "ord_2", at: NIGHT, by: guest }],
        guest,
      ),
    );

    day.reopen(IDLE, NIGHT, "staff-1");
    day.close([order("ord_1"), order("ord_2")], new Set(["ord_2"]), MORNING, null);
    const third = versionOf(
      next(second, day.toSnapshot(), "closed", [{ orderId: "ord_2", at: NIGHT, by: null }]),
    );

    expect(entries(third)).toEqual(["ord_1:arrested_after_reopen"]);
    expect(third.content.withdrawn).toEqual([
      { orderId: "ord_2", rank: 1, at: NIGHT.toISOString(), by: guest },
    ]);
  });

  it("une retirée d'avant les versions n'a pas d'auteur : `null`, jamais inventé", () => {
    const version = versionOf(
      next(null, closed([order("ord_1")]).toSnapshot(), "closed", [
        { orderId: "ord_9", at: NIGHT, by: null },
      ]),
    );

    expect(version.content.withdrawn).toEqual([
      { orderId: "ord_9", rank: 1, at: NIGHT.toISOString(), by: null },
    ]);
  });
});

describe("PlanVersion.next — rien à garder", () => {
  it("une journée qui n'est pas arrêtée n'a pas de plan : `null`", () => {
    expect(next(null, ProductionDay.open(DAY).toSnapshot(), "order_withdrawn")).toBeNull();
  });

  it("le plan n'a pas changé : `null`", () => {
    const day = closed([order("ord_1")]);
    const first = versionOf(next(null, day.toSnapshot(), "closed"));

    expect(next(first, day.toSnapshot(), "order_revised")).toBeNull();
  });

  it("le plan relu dans un autre ordre (lignes, compte) n'a pas changé", () => {
    const day = closed([
      order("ord_2", { lines: [orderLine("VIE-001", 4), orderLine("BAG", 2)] }),
      order("ord_1"),
    ]);
    const first = versionOf(next(null, day.toSnapshot(), "closed"));
    const snapshot = day.toSnapshot();
    const shuffled = {
      ...snapshot,
      orders: [...snapshot.orders]
        .reverse()
        .map((planned) => ({ ...planned, lines: [...planned.lines].reverse() })),
      counts: [...snapshot.counts].reverse(),
    };

    expect(next(first, shuffled, "order_revised")).toBeNull();
  });

  it("un retrait de plus change le plan, même si les commandes et le compte restent", () => {
    const day = closed([order("ord_1")]);
    const first = versionOf(next(null, day.toSnapshot(), "closed"));

    expect(
      next(first, day.toSnapshot(), "order_withdrawn", [
        { orderId: "ord_1", at: NIGHT, by: MARIE },
      ]),
    ).not.toBeNull();
  });
});

describe("ProductionDay.numberPlanVersion", () => {
  it("prend le numéro suivant, et le rend dans l'instantané", () => {
    const day = closed([order("ord_1")]);

    day.numberPlanVersion(1);
    day.numberPlanVersion(2);

    expect(day.planVersion).toBe(2);
    expect(day.toSnapshot().planVersion).toBe(2);
  });

  it("la réouverture ne remet pas le numéro à zéro", () => {
    const day = closed([order("ord_1")]);
    day.numberPlanVersion(1);

    day.reopen(IDLE, NIGHT, "staff-1");

    expect(day.planVersion).toBe(1);
  });

  it("refuse un numéro qui ne suit pas le courant", () => {
    const day = closed([order("ord_1")]);

    expect(() => day.numberPlanVersion(2)).toThrow(PlanVersionOutOfSequenceError);
  });
});
