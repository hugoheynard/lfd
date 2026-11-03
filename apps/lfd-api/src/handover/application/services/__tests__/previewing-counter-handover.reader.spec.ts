import { instantToLocal } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import type { DurableFact } from "../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ShipmentRef } from "../../../../production/channels/handover/index.js";
import {
  HandoverSubjectReader,
  type HandoverSubject,
} from "../../../channels/commerce/handover-subject.reader.js";
import { OrderHandover } from "../../../domain/entities/order-handover.js";
import { OrderHandoverRepository } from "../../../domain/ports/order-handover.repository.js";
import { FixedOrderLock } from "../../__tests__/fixed-order-lock.js";
import { FixedQualityHolds } from "../../__tests__/fixed-quality-holds.js";
import { FixedTransferStatus } from "../../__tests__/fixed-transfer-status.js";
import { NOT_SERVED_REASON } from "../attesting-counter-handover.desk.js";
import { HandoverAttestation } from "../handover-attestation.service.js";
import { PreviewingCounterHandoverReader } from "../previewing-counter-handover.reader.js";

/**
 * L'aperçu du guichet du comptoir (lot C1b, 2026-11-03) : la même garde que
 * `vet`, rendue au lieu d'être levée — sans verrou ni écriture.
 */

// Un instant gelé : le jour du comptoir se déduit de l'horloge, jamais du mur.
const NOW = new Date(1_900_000_000_000);
const TODAY = instantToLocal(NOW).day;
const DAY_MS = 86_400_000;

function serviceDate(offsetDays = 0): Date {
  return new Date(Date.parse(`${TODAY}T00:00:00.000Z`) + offsetDays * DAY_MS);
}

function subject(overrides: Partial<HandoverSubject> = {}): HandoverSubject {
  return {
    orderId: "ord_1",
    orderNumber: "ORD-0001",
    placedByUserId: "usr_1",
    customerLabel: "Les Halles",
    placedAt: new Date(NOW.getTime() - DAY_MS),
    requestedDeliveryDate: serviceDate(),
    pickupLabel: "Le labo",
    status: "confirmed",
    settled: true,
    fulfillmentMethod: "pickup",
    note: "",
    lines: [{ sku: "CRO", productName: "Croissant", quantity: 12, saleUnit: "piece" }],
    laterShipments: [],
    ...overrides,
  };
}

class OneSubject extends HandoverSubjectReader {
  constructor(private readonly found: HandoverSubject | null) {
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

  byOrderIds(): Promise<ReadonlyMap<string, HandoverSubject>> {
    const found = this.found;
    return Promise.resolve(new Map(found === null ? [] : [[found.orderId, found]]));
  }
}

class Handovers extends OrderHandoverRepository {
  readonly written: OrderHandover[] = [];

  constructor(private readonly existing: OrderHandover | null = null) {
    super();
  }

  findByShipment(_shipment: ShipmentRef): Promise<OrderHandover | null> {
    return Promise.resolve(this.existing);
  }

  attest(handover: OrderHandover): Promise<boolean> {
    this.written.push(handover);
    return Promise.resolve(true);
  }
}

class Facts extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  publish(fact: DurableFact): Promise<void> {
    this.facts.push(fact);
    return Promise.resolve();
  }
}

interface Scene {
  readonly found?: HandoverSubject | null;
  readonly held?: readonly string[];
  readonly transfer?: "planned" | "awaiting";
  readonly existing?: OrderHandover | null;
}

function scene(options: Scene = {}) {
  const handovers = new Handovers(options.existing ?? null);
  const facts = new Facts();
  const lock = new FixedOrderLock();
  const clock = new FixedClock(NOW);
  const transfers = new FixedTransferStatus(
    options.transfer === undefined ? new Map() : new Map([["ord_1", options.transfer]]),
  );
  const attestation = new HandoverAttestation(
    handovers,
    clock,
    new DirectUnitOfWork(),
    facts,
    new FixedQualityHolds(options.held ?? []),
    transfers,
    lock,
  );
  const found = options.found === undefined ? subject() : options.found;
  return {
    handovers,
    facts,
    lock,
    reader: new PreviewingCounterHandoverReader(new OneSubject(found), attestation, clock),
  };
}

describe("PreviewingCounterHandoverReader — la garde du comptoir, lue avant le geste", () => {
  it("ouvre un retrait du jour remettable, sans verrou ni écriture", async () => {
    const { reader, handovers, facts, lock } = scene();

    expect(await reader.previewOf("ord_1")).toEqual({ kind: "open" });
    expect(lock.locked).toEqual([]);
    expect(handovers.written).toEqual([]);
    expect(facts.facts).toEqual([]);
  });

  it("dit une livraison hors de portée", async () => {
    const { reader } = scene({ found: subject({ fulfillmentMethod: "delivery" }) });

    expect(await reader.previewOf("ord_1")).toEqual({
      kind: "out_of_reach",
      refusal: "not_a_pickup",
    });
  });

  it("dit un autre jour hors de portée, et une commande sans jour aussi", async () => {
    const tomorrow = scene({ found: subject({ requestedDeliveryDate: serviceDate(1) }) });
    const undated = scene({ found: subject({ requestedDeliveryDate: null }) });

    expect(await tomorrow.reader.previewOf("ord_1")).toEqual({
      kind: "out_of_reach",
      refusal: "other_day",
    });
    expect(await undated.reader.previewOf("ord_1")).toEqual({
      kind: "out_of_reach",
      refusal: "other_day",
    });
  });

  it("rend la phrase du retrait : non réglée, retenue, transfert pas reçu", async () => {
    const unsettled = await scene({ found: subject({ settled: false }) }).reader.previewOf("ord_1");
    const held = await scene({ held: ["ord_1"] }).reader.previewOf("ord_1");
    const travelling = await scene({ transfer: "planned" }).reader.previewOf("ord_1");

    for (const preview of [unsettled, held, travelling]) {
      expect(preview.kind).toBe("refused");
    }
    expect(travelling.kind === "refused" ? travelling.reason : "").toContain("Val Village");
  });

  it("dit « déjà retirée » plutôt que le transfert, comme le geste", async () => {
    const existing = OrderHandover.attest(
      subject(),
      1,
      { handedOverAt: null, qualityHold: false },
      NOW,
      "staff_1",
      "manual",
    );
    const preview = await scene({ existing, transfer: "planned" }).reader.previewOf("ord_1");

    expect(preview).toEqual({ kind: "refused", reason: "Cette commande a déjà été retirée." });
  });

  it("refuse une commande que le commerce ne sert plus, avec la phrase du geste", async () => {
    expect(await scene({ found: null }).reader.previewOf("ord_1")).toEqual({
      kind: "refused",
      reason: NOT_SERVED_REASON,
    });
  });
});
