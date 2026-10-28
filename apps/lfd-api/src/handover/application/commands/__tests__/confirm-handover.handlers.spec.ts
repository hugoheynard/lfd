import {
  TransactionalDurablePublisher,
  TransactionalUnitOfWork,
} from "../../../../platform/outbox/__tests__/transactional-durable.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ShipmentRef } from "../../../../production/channels/handover/index.js";
import { FixedStaffAuthorDirectory } from "../../../../staff/directory/domain/__tests__/fixed-staff-author-directory.js";
import {
  HandoverSubjectReader,
  type HandoverSubject,
} from "../../../channels/commerce/handover-subject.reader.js";
import type { OrderHandover } from "../../../domain/entities/order-handover.js";
import { HandoverReferenceNotFoundError } from "../../../domain/errors/handover-errors.js";
import { HandedOverOrdersReader } from "../../../domain/ports/handed-over-orders.reader.js";
import { OrderHandoverRepository } from "../../../domain/ports/order-handover.repository.js";
import { FixedOrderLock } from "../../__tests__/fixed-order-lock.js";
import { FixedQualityHolds } from "../../__tests__/fixed-quality-holds.js";
import { FixedTransferStatus } from "../../__tests__/fixed-transfer-status.js";
import { HandoverAttestation } from "../../services/handover-attestation.service.js";
import { HandoverCounterView } from "../../services/handover-counter-view.js";
import { ConfirmHandoverCommand } from "../confirm-handover.command.js";
import { ConfirmHandoverHandler } from "../confirm-handover.handler.js";
import { ConfirmManualHandoverCommand } from "../confirm-manual-handover.command.js";
import { ConfirmManualHandoverHandler } from "../confirm-manual-handover.handler.js";

/**
 * Le scan et la saisie, par envoi (plan E7 reliquat, choix 13, lot L4c) : le
 * jeton et le numéro résolvent la COMMANDE ; « Remettre » vise les envois
 * cochés, sinon celui que l'écran montrait.
 */

const AT = new Date(0);
const NUMBER = "ORD-ABCD-1234";

/** Les attestations, gardées une fois et lues par les deux ports du retrait. */
class Attestations extends OrderHandoverRepository {
  readonly all: OrderHandover[] = [];

  findByShipment(shipment: ShipmentRef): Promise<OrderHandover | null> {
    return Promise.resolve(
      this.all.find((h) => h.orderId === shipment.orderId && h.rank === shipment.rank) ?? null,
    );
  }

  attest(handover: OrderHandover): Promise<boolean> {
    this.all.push(handover);
    return Promise.resolve(true);
  }

  ranks(): number[] {
    return this.all.map(({ rank }) => rank);
  }
}

class AttestedAmong extends HandedOverOrdersReader {
  constructor(private readonly attestations: Attestations) {
    super();
  }

  handedOverAmong(shipments: readonly ShipmentRef[]): Promise<readonly ShipmentRef[]> {
    const ranks = new Set(this.attestations.ranks());
    return Promise.resolve(shipments.filter(({ rank }) => ranks.has(rank)));
  }
}

/** La commande, par le jeton comme par son numéro exact — rien d'autre. */
class OneOrder extends HandoverSubjectReader {
  constructor(private readonly subject: HandoverSubject) {
    super();
  }

  byToken(): Promise<HandoverSubject | null> {
    return Promise.resolve(this.subject);
  }

  byReference(reference: string): Promise<HandoverSubject | null> {
    return Promise.resolve(reference === NUMBER ? this.subject : null);
  }

  byOrderId(): Promise<HandoverSubject | null> {
    return Promise.resolve(this.subject);
  }
}

function subject(withPackedRest: boolean): HandoverSubject {
  return {
    orderId: "ord_1",
    orderNumber: NUMBER,
    placedByUserId: "usr_1",
    customerLabel: "Les Halles",
    placedAt: AT,
    requestedDeliveryDate: null,
    pickupLabel: null,
    status: "ready",
    settled: true,
    fulfillmentMethod: "pickup",
    note: "",
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 10, saleUnit: "piece" }],
    laterShipments: withPackedRest
      ? [
          {
            rank: 2,
            prepared: true,
            lines: [
              { sku: "VIE-001", productName: "Croissant", quantity: 2, saleUnit: "piece" as const },
            ],
          },
        ]
      : [],
  };
}

function scene(withPackedRest: boolean) {
  const attestations = new Attestations();
  const uow = new TransactionalUnitOfWork();
  const holds = new FixedQualityHolds();
  const attestation = new HandoverAttestation(
    attestations,
    new FixedClock(AT),
    uow,
    new TransactionalDurablePublisher(uow),
    holds,
    new FixedTransferStatus(),
    new FixedOrderLock(),
  );
  const counter = new HandoverCounterView(
    attestations,
    new AttestedAmong(attestations),
    new FixedStaffAuthorDirectory(),
    holds,
  );
  const subjects = new OneOrder(subject(withPackedRest));
  return {
    attestations,
    scan: new ConfirmHandoverHandler(subjects, attestation, counter),
    manual: new ConfirmManualHandoverHandler(subjects, attestation, counter),
  };
}

describe("le retrait par envoi au comptoir (L4c)", () => {
  it("un seul envoi, sans choix : la commande, au rang 1, comme avant", async () => {
    const { attestations, scan } = scene(false);

    const view = await scan.execute(new ConfirmHandoverCommand("jeton", "staff-1"));

    expect(attestations.ranks()).toEqual([1]);
    expect(view).toMatchObject({ rank: 1, reference: NUMBER, handedOverVia: "scan" });
    expect(view.shipments).toEqual([]);
  });

  it("deux envois cochés : les deux remis d'un geste, plus rien à cocher", async () => {
    const { attestations, scan } = scene(true);

    const view = await scan.execute(new ConfirmHandoverCommand("jeton", "staff-1", [1, 2]));

    expect(attestations.ranks()).toEqual([1, 2]);
    expect(view.rank).toBe(1);
    expect(view.shipments).toEqual([]);
  });

  it("un seul envoi coché sur deux : l'autre reste à tendre", async () => {
    const { attestations, scan } = scene(true);

    const view = await scan.execute(new ConfirmHandoverCommand("jeton", "staff-1", [2]));

    expect(attestations.ranks()).toEqual([2]);
    expect(view).toMatchObject({ rank: 2, reference: `${NUMBER}-2` });
    expect(view.shipments.map(({ rank }) => rank)).toEqual([1]);
  });

  it("la commande déjà retirée, sans choix : le scan remet le reste qu'il montrait", async () => {
    const { attestations, scan } = scene(true);
    await scan.execute(new ConfirmHandoverCommand("jeton", "staff-1", [1]));

    await scan.execute(new ConfirmHandoverCommand("jeton", "staff-1"));

    expect(attestations.ranks()).toEqual([1, 2]);
  });

  it("la saisie d'un numéro de reste (`ORD-…-2`) remet ce reste, et grave `manual`", async () => {
    const { attestations, manual } = scene(true);

    const view = await manual.execute(new ConfirmManualHandoverCommand(`${NUMBER}-2`, "staff-1"));

    expect(attestations.ranks()).toEqual([2]);
    expect(view).toMatchObject({ rank: 2, handedOverVia: "manual" });
  });

  it("la saisie du numéro de commande mène au même choix que le scan", async () => {
    const { attestations, manual } = scene(true);

    await manual.execute(new ConfirmManualHandoverCommand(NUMBER, "staff-1", [1, 2]));

    expect(attestations.ranks()).toEqual([1, 2]);
  });

  it("un numéro qui ne désigne ni commande ni reste est introuvable", async () => {
    const { attestations, manual } = scene(true);

    await expect(
      manual.execute(new ConfirmManualHandoverCommand("ORD-INCONNUE-2", "staff-1")),
    ).rejects.toBeInstanceOf(HandoverReferenceNotFoundError);
    expect(attestations.ranks()).toEqual([]);
  });
});
