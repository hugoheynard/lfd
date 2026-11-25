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
 * Le scan et la saisie : le jeton et le numéro résolvent la COMMANDE, et
 * « Remettre » atteste son envoi, le rang 1.
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

  async byOrderIds(orderIds: readonly string[]): Promise<ReadonlyMap<string, HandoverSubject>> {
    const found = new Map<string, HandoverSubject>();
    for (const orderId of orderIds) {
      const subject = await this.byOrderId();
      if (subject !== null) {
        found.set(orderId, subject);
      }
    }
    return found;
  }
}

function subject(): HandoverSubject {
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
    awaitingShortfallDecision: false,
    settleAtShopTill: null,
    fulfillmentMethod: "pickup",
    note: "",
    lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 10, saleUnit: "piece" }],
  };
}

function scene() {
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
  const counter = new HandoverCounterView(attestations, new FixedStaffAuthorDirectory(), holds);
  const subjects = new OneOrder(subject());
  return {
    attestations,
    scan: new ConfirmHandoverHandler(subjects, attestation, counter),
    manual: new ConfirmManualHandoverHandler(subjects, attestation, counter),
  };
}

describe("le retrait au comptoir", () => {
  it("le scan atteste la commande au rang 1, sous son numéro", async () => {
    const { attestations, scan } = scene();

    const view = await scan.execute(new ConfirmHandoverCommand("jeton", "staff-1"));

    expect(attestations.ranks()).toEqual([1]);
    expect(view).toMatchObject({ rank: 1, reference: NUMBER, handedOverVia: "scan" });
  });

  it("la saisie du numéro de commande atteste la commande, et grave `manual`", async () => {
    const { attestations, manual } = scene();

    const view = await manual.execute(new ConfirmManualHandoverCommand(NUMBER, "staff-1"));

    expect(attestations.ranks()).toEqual([1]);
    expect(view).toMatchObject({ rank: 1, handedOverVia: "manual" });
  });

  it("un numéro de reste (`ORD-…-2`) n'est plus reconnu : introuvable", async () => {
    const { attestations, manual } = scene();

    await expect(
      manual.execute(new ConfirmManualHandoverCommand(`${NUMBER}-2`, "staff-1")),
    ).rejects.toBeInstanceOf(HandoverReferenceNotFoundError);
    expect(attestations.ranks()).toEqual([]);
  });
});
