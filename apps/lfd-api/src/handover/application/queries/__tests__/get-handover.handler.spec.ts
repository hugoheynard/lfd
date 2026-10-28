import {
  HandoverSubjectReader,
  type HandoverSubject,
} from "../../../channels/commerce/handover-subject.reader.js";
import { OrderHandover } from "../../../domain/entities/order-handover.js";
import { HandedOverOrdersReader } from "../../../domain/ports/handed-over-orders.reader.js";
import { OrderHandoverRepository } from "../../../domain/ports/order-handover.repository.js";
import { ShipmentRef } from "../../../../production/channels/handover/index.js";
import { HandoverCounterView } from "../../services/handover-counter-view.js";
import { FixedStaffAuthorDirectory } from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import { FixedQualityHolds } from "../../__tests__/fixed-quality-holds.js";
import { GetHandoverByOrderHandler } from "../get-handover-by-order.handler.js";
import { GetHandoverByOrderQuery } from "../get-handover-by-order.query.js";
import { GetHandoverHandler } from "../get-handover.handler.js";
import { GetHandoverQuery } from "../get-handover.query.js";

/**
 * Les deux écrans AVANT le geste — le scan et le rail de la file — disent la
 * retenue qualité par `blockedReason`, dans l'ordre de la règle
 * (`plan-controle-qualite.md`, D4). En oublier un, c'est un écran qui dit
 * « remettable » et un scan qui refuse.
 */

// Le jour de service de la commande : jamais comparé à l'horloge ici.
const SERVICE_DAY = "2026-09-08";

function subject(overrides: Partial<HandoverSubject> = {}): HandoverSubject {
  return {
    orderId: "ord_1",
    orderNumber: "ORD-ABCD-1234",
    placedByUserId: "usr_1",
    customerLabel: "Les Halles",
    placedAt: new Date("2026-09-06T08:00:00.000Z"),
    requestedDeliveryDate: new Date(`${SERVICE_DAY}T00:00:00.000Z`),
    pickupLabel: "Le labo",
    status: "ready",
    settled: true,
    fulfillmentMethod: "pickup",
    note: "",
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 2, saleUnit: "piece" }],
    laterShipments: [],
    ...overrides,
  };
}

/** Le même sujet, quel que soit le chemin d'accès. */
class FixedSubjects extends HandoverSubjectReader {
  constructor(private readonly found: HandoverSubject) {
    super();
  }

  byToken(): Promise<HandoverSubject | null> {
    return Promise.resolve(this.found);
  }

  byReference(): Promise<HandoverSubject | null> {
    return Promise.resolve(this.found);
  }

  byOrderId(): Promise<HandoverSubject | null> {
    return Promise.resolve(this.found);
  }
}

/** Les attestations gravées, par envoi — aucune par défaut. */
class FixedHandovers extends OrderHandoverRepository {
  private readonly byRank: ReadonlyMap<number, OrderHandover>;

  constructor(existing: readonly OrderHandover[]) {
    super();
    this.byRank = new Map(existing.map((handover) => [handover.rank, handover]));
  }

  findByShipment(shipment: ShipmentRef): Promise<OrderHandover | null> {
    return Promise.resolve(this.byRank.get(shipment.rank) ?? null);
  }

  /** Le même dépôt, lu comme la question « lesquels sont partis ? ». */
  asHandedOver(): HandedOverOrdersReader {
    const ranks = new Set(this.byRank.keys());
    return new (class extends HandedOverOrdersReader {
      handedOverAmong(shipments: readonly ShipmentRef[]): Promise<readonly ShipmentRef[]> {
        return Promise.resolve(shipments.filter((shipment) => ranks.has(shipment.rank)));
      }
    })();
  }

  attest(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

/** Une attestation, plusieurs (une par envoi), ou aucune. */
type Attested = OrderHandover | null | readonly OrderHandover[];

function counterOf(existing: Attested, holds: FixedQualityHolds): HandoverCounterView {
  const handovers = new FixedHandovers(
    existing === null ? [] : existing instanceof OrderHandover ? [existing] : existing,
  );
  return new HandoverCounterView(
    handovers,
    handovers.asHandedOver(),
    new FixedStaffAuthorDirectory(),
    holds,
  );
}

const READERS = [
  {
    name: "le scan (GetHandoverHandler)",
    read: (found: HandoverSubject, existing: Attested, holds: FixedQualityHolds) =>
      new GetHandoverHandler(new FixedSubjects(found), counterOf(existing, holds)).execute(
        new GetHandoverQuery("jeton"),
      ),
  },
  {
    name: "le rail de la file (GetHandoverByOrderHandler)",
    read: (found: HandoverSubject, existing: Attested, holds: FixedQualityHolds) =>
      new GetHandoverByOrderHandler(new FixedSubjects(found), counterOf(existing, holds)).execute(
        new GetHandoverByOrderQuery("ord_1"),
      ),
  },
];

describe.each(READERS)("$name — la retenue qualité", ({ read }) => {
  it("dit « en vérification » d'une commande retenue, en demandant son jour", async () => {
    const holds = new FixedQualityHolds(["ord_1"]);

    const view = await read(subject(), null, holds);

    expect(view.blockedReason).toBe("Commande en cours de vérification.");
    expect(holds.asked).toEqual([{ serviceDay: SERVICE_DAY, orderIds: ["ord_1"] }]);
  });

  it("ne bloque rien quand la production ne retient pas la commande", async () => {
    const view = await read(subject(), null, new FixedQualityHolds());

    expect(view.blockedReason).toBeNull();
  });

  it("🔴 dit « déjà retirée » d'un sac parti, même retenu après coup", async () => {
    const earlier = OrderHandover.rehydrate(
      "ord_1",
      "ORD-ABCD-1234",
      new Date("2026-09-08T07:00:00.000Z"),
      "staff-0",
      "scan",
    );

    const view = await read(subject(), earlier, new FixedQualityHolds(["ord_1"]));

    expect(view.blockedReason).toBe("Cette commande a déjà été retirée.");
  });

  it("dit « pas réglée » d'une commande carte non réglée — la vue suit le scan", async () => {
    const view = await read(subject({ settled: false }), null, new FixedQualityHolds());

    expect(view.blockedReason).toMatch(/^Cette commande n'est pas réglée : /);
  });

  it("dit « annulée » d'une commande annulée ET retenue", async () => {
    const view = await read(
      subject({ status: "cancelled" }),
      null,
      new FixedQualityHolds(["ord_1"]),
    );

    expect(view.blockedReason).toBe("Cette commande est annulée.");
  });

  it("ne pose aucune question pour une commande sans jour demandé", async () => {
    const holds = new FixedQualityHolds(["ord_1"]);

    const view = await read(subject({ requestedDeliveryDate: null }), null, holds);

    expect(view.blockedReason).toBeNull();
    expect(holds.asked).toEqual([]);
  });
});

/** Un reste de la commande, colisé ou non (plan E7 reliquat, L4c). */
function withRemainder(prepared: boolean): HandoverSubject {
  return subject({
    laterShipments: [
      {
        rank: 2,
        prepared,
        lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 1, saleUnit: "piece" }],
      },
    ],
  });
}

function attestedAt(rank: number): OrderHandover {
  return OrderHandover.rehydrate(
    "ord_1",
    rank === 1 ? "ORD-ABCD-1234" : `ORD-ABCD-1234-${String(rank)}`,
    new Date("2026-09-08T07:00:00.000Z"),
    "staff-0",
    "scan",
    rank,
  );
}

/** P6 de `pricing/vente-au-poids.md` : le comptoir recompte des pièces, pas des grammes. */
describe.each(READERS)("$name — une commande mêlée pièce et poids", ({ read }) => {
  it("compte 12 croissants et UN saumon : 13, et garde l'unité de chaque ligne", async () => {
    const view = await read(
      subject({
        lines: [
          { sku: "VIE-001", productName: "Croissant", quantity: 12, saleUnit: "piece" },
          { sku: "TRA-SAU", productName: "Saumon gravlax", quantity: 1250, saleUnit: "weight" },
        ],
      }),
      null,
      new FixedQualityHolds(),
    );

    expect(view.totalUnits).toBe(13);
    expect(view.lines).toEqual([
      { sku: "VIE-001", productName: "Croissant", quantity: 12, saleUnit: "piece" },
      { sku: "TRA-SAU", productName: "Saumon gravlax", quantity: 1250, saleUnit: "weight" },
    ]);
  });

  it("une ligne au poids décidée à 0 g ne compte pour rien", async () => {
    const view = await read(
      subject({
        lines: [
          { sku: "VIE-001", productName: "Croissant", quantity: 2, saleUnit: "piece" },
          { sku: "TRA-SAU", productName: "Saumon gravlax", quantity: 0, saleUnit: "weight" },
        ],
      }),
      null,
      new FixedQualityHolds(),
    );

    expect(view.totalUnits).toBe(2);
  });
});

describe.each(READERS)("$name — les envois prêts (plan E7 reliquat, L4c)", ({ read }) => {
  it("un seul envoi : la commande, au rang 1, comme avant", async () => {
    const view = await read(subject(), null, new FixedQualityHolds());

    expect(view).toMatchObject({ rank: 1, reference: "ORD-ABCD-1234", totalUnits: 2 });
    expect(view.shipments.map(({ rank }) => rank)).toEqual([1]);
  });

  it("deux envois prêts, rien de retiré : les deux sont rendus, la vue reste sur la commande", async () => {
    const view = await read(withRemainder(true), null, new FixedQualityHolds());

    expect(view.rank).toBe(1);
    expect(view.shipments).toEqual([
      {
        rank: 1,
        reference: "ORD-ABCD-1234",
        totalUnits: 2,
        lines: [
          { sku: "VIE-001", productName: "Croissant", quantity: 2, saleUnit: "piece" as const },
        ],
      },
      {
        rank: 2,
        reference: "ORD-ABCD-1234-2",
        totalUnits: 1,
        lines: [
          { sku: "VIE-001", productName: "Croissant", quantity: 1, saleUnit: "piece" as const },
        ],
      },
    ]);
  });

  it("la commande retirée, son reste colisé : la vue montre le reste, remettable", async () => {
    const view = await read(withRemainder(true), attestedAt(1), new FixedQualityHolds());

    expect(view).toMatchObject({
      rank: 2,
      reference: "ORD-ABCD-1234-2",
      totalUnits: 1,
      handedOverAt: null,
      blockedReason: null,
    });
    expect(view.shipments.map(({ rank }) => rank)).toEqual([2]);
  });

  it("un reste prévu, pas encore colisé, n'est pas à tendre", async () => {
    const view = await read(withRemainder(false), attestedAt(1), new FixedQualityHolds());

    expect(view.rank).toBe(1);
    expect(view.blockedReason).toBe("Cette commande a déjà été retirée.");
    expect(view.shipments).toEqual([]);
  });

  it("tout est retiré : la vue dit la commande « déjà retirée », plus rien à cocher", async () => {
    const view = await read(
      withRemainder(true),
      [attestedAt(1), attestedAt(2)],
      new FixedQualityHolds(),
    );

    expect(view.blockedReason).toBe("Cette commande a déjà été retirée.");
    expect(view.shipments).toEqual([]);
  });
});
