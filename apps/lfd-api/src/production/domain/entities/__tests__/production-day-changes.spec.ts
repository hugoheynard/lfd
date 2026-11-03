import {
  orderLine,
  producibleOrder,
} from "../../../channels/commerce/__tests__/producible-order.fixture.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import type { PlacedResupply } from "../../../channels/commerce/day-resupplies.reader.js";
import { ServiceDay } from "../../value-objects/service-day.value-object.js";
import { NOTHING_PENDING, ProductionDay } from "../production-day.js";
import { UNCHANGED_DAY, WHOLE_DAY } from "../production-day.changes.js";

/**
 * Ce que la journée dit avoir changé depuis sa lecture — l'adaptateur n'écrit
 * que ça (écriture par différence, 2026-11-02). Dates recopiées et comparées
 * entre elles seulement — exception étroite du §5.
 */

const EVENING = new Date("2026-09-07T18:00:00.000Z");
const MORNING = new Date("2026-09-08T07:30:00.000Z");
const NONE = new Set<string>();
const IDLE = { packingStarted: false, dispatchStarted: false };

function order(orderId: string, quantity = 4): ProducibleOrder {
  return producibleOrder(orderId, {
    reference: `REF-${orderId}`,
    customerLabel: "Hôtel des Trois Ponts",
    lines: [orderLine("VIE-001", quantity, "Croissant")],
  });
}

function resupply(resupplyId: string): PlacedResupply {
  return {
    resupplyId,
    siteId: "site_village",
    siteLabel: "Le Village",
    name: null,
    servedByTransfer: true,
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 6, saleUnit: "piece" }],
  };
}

/** Une journée arrêtée, telle que l'adaptateur la relit : rien n'a changé. */
function reloadedClosed(): ProductionDay {
  const day = ProductionDay.open(ServiceDay.of("2026-09-08"));
  day.close([order("ord_1")], NONE, EVENING, null, [resupply("rs_evening")]);
  return ProductionDay.restore(day.toSnapshot());
}

describe("ProductionDay.changes — ce que save écrira", () => {
  it("une journée relue en base, ou jamais écrite, n'a rien changé", () => {
    expect(reloadedClosed().changes).toEqual(UNCHANGED_DAY);
    expect(ProductionDay.open(ServiceDay.of("2026-09-08")).changes).toEqual(UNCHANGED_DAY);
  });

  it("une journée de base inconnue (fromSnapshot) s'écrit en entier", () => {
    const day = ProductionDay.fromSnapshot(reloadedClosed().toSnapshot());

    expect(day.changes).toEqual(WHOLE_DAY);
  });

  it("l'arrêt remplace le plan du soir et le compte", () => {
    const day = ProductionDay.open(ServiceDay.of("2026-09-08"));

    day.close([order("ord_1")], NONE, EVENING, null);

    expect(day.changes).toEqual({ ...UNCHANGED_DAY, plan: true, counts: true });
  });

  it("le retirage n'ajoute que les commandes arrivées", () => {
    const day = reloadedClosed();

    day.retake([order("ord_1"), order("ord_2")], NONE, MORNING, "s_max", null);

    expect(day.changes).toEqual({ ...UNCHANGED_DAY, addedOrders: ["ord_2"], counts: true });
  });

  it("un retirage sans arrivée ne change rien", () => {
    const day = reloadedClosed();

    day.retake([order("ord_1")], NONE, MORNING, "s_max", null);

    expect(day.changes).toEqual(UNCHANGED_DAY);
  });

  it("un lancement « au plus tôt » n'écrit que ce réassort et le compte", () => {
    const day = reloadedClosed();

    day.launchResupply(
      resupply("rs_asap"),
      { at: MORNING, staffUserId: "s_max", name: null },
      NOTHING_PENDING,
    );

    expect(day.changes).toEqual({ ...UNCHANGED_DAY, launched: ["rs_asap"], counts: true });
  });

  it("une révision n'écrit que la commande révisée et le compte", () => {
    const day = reloadedClosed();

    day.reviseOrder("ord_1", [{ sku: "VIE-001", quantity: 9 }]);

    expect(day.changes).toEqual({ ...UNCHANGED_DAY, revisedOrders: ["ord_1"], counts: true });
  });

  it("la réouverture remplace le plan du soir et le compte", () => {
    const day = reloadedClosed();

    day.reopen(IDLE, MORNING, "s_max");

    expect(day.changes).toEqual({ ...UNCHANGED_DAY, plan: true, counts: true });
  });
});

/**
 * Garde (audit du réassort, 2026-11-02) : `save` n'écrit QUE ce que `changes`
 * dit. Un mutateur ajouté sans marquer `changes` changerait la journée en
 * mémoire et rien en base — sans erreur, sans test rouge. Toute méthode
 * publique doit donc être classée ici ; une méthode neuve fait échouer le
 * premier test tant qu'on n'a pas dit ce qu'elle écrit.
 */
describe("chaque mutateur de ProductionDay marque ce qu'il change", () => {
  const gesture = { at: MORNING, staffUserId: "s_max", name: null };
  /** Les mutateurs que `save` écrit, chacun joué sur une journée relue. */
  const SAVED: Readonly<Record<string, (day: ProductionDay) => void>> = {
    close: (day) => day.close([order("ord_9")], NONE, MORNING, null),
    retake: (day) => day.retake([order("ord_1"), order("ord_2")], NONE, MORNING, "s_max", null),
    reopen: (day) => day.reopen(IDLE, MORNING, "s_max"),
    launchResupply: (day) => day.launchResupply(resupply("rs_asap"), gesture, NOTHING_PENDING),
    reviseOrder: (day) => day.reviseOrder("ord_1", [{ sku: "VIE-001", quantity: 9 }]),
  };
  /** `materialize` touche les fournées, qui ont leur port : l'appelant les écrit. */
  const BATCH_PORT = ["materialize"];
  /** Les lectures et les gardes qui refusent sans muter. */
  const READERS = [
    "producedOf",
    "batchToRecord",
    "acknowledge",
    "batchToComplete",
    "batchToCancel",
    "batchesToUncheck",
    "itemToMark",
    "toSnapshot",
  ];

  function methodsOf(prototype: object): readonly string[] {
    return Object.getOwnPropertyNames(prototype).filter(
      (name) =>
        name !== "constructor" &&
        typeof Object.getOwnPropertyDescriptor(prototype, name)?.value === "function",
    );
  }

  it("toute méthode publique de la journée est classée", () => {
    const own = methodsOf(ProductionDay.prototype);
    const inherited = methodsOf(Object.getPrototypeOf(ProductionDay.prototype) as object);

    expect([...own, ...inherited].sort()).toEqual(
      [...Object.keys(SAVED), ...BATCH_PORT, ...READERS].sort(),
    );
  });

  it.each(Object.keys(SAVED))("%s change l'instantané ET le dit à `save`", (name) => {
    const day =
      name === "close"
        ? ProductionDay.restore(ProductionDay.open(ServiceDay.of("2026-09-08")).toSnapshot())
        : reloadedClosed();
    const before = { ...day.toSnapshot(), batches: [] };

    SAVED[name]?.(day);

    expect({ ...day.toSnapshot(), batches: [] }).not.toEqual(before);
    expect(day.changes).not.toEqual(UNCHANGED_DAY);
  });
});
