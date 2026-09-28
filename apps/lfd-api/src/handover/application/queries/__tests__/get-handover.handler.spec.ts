import {
  HandoverSubjectReader,
  type HandoverSubject,
} from "../../../channels/commerce/handover-subject.reader.js";
import { OrderHandover } from "../../../domain/entities/order-handover.js";
import { OrderHandoverRepository } from "../../../domain/ports/order-handover.repository.js";
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
    fulfillmentMethod: "pickup",
    note: "",
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 2 }],
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

class FixedHandovers extends OrderHandoverRepository {
  constructor(private readonly existing: OrderHandover | null) {
    super();
  }

  findByOrderId(): Promise<OrderHandover | null> {
    return Promise.resolve(this.existing);
  }

  attest(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

const READERS = [
  {
    name: "le scan (GetHandoverHandler)",
    read: (found: HandoverSubject, existing: OrderHandover | null, holds: FixedQualityHolds) =>
      new GetHandoverHandler(
        new FixedSubjects(found),
        new FixedHandovers(existing),
        new FixedStaffAuthorDirectory(),
        holds,
      ).execute(new GetHandoverQuery("jeton")),
  },
  {
    name: "le rail de la file (GetHandoverByOrderHandler)",
    read: (found: HandoverSubject, existing: OrderHandover | null, holds: FixedQualityHolds) =>
      new GetHandoverByOrderHandler(
        new FixedSubjects(found),
        new FixedHandovers(existing),
        new FixedStaffAuthorDirectory(),
        holds,
      ).execute(new GetHandoverByOrderQuery("ord_1")),
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
