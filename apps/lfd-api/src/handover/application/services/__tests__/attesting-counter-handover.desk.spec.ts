import { instantToLocal } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import type { DurableFact } from "../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { ShipmentRef } from "../../../../production/channels/handover/index.js";
import {
  HandoverSubjectReader,
  type HandoverSubject,
} from "../../../channels/commerce/handover-subject.reader.js";
import type { OrderHandover } from "../../../domain/entities/order-handover.js";
import {
  CounterOutOfReachError,
  CounterTokenMismatchError,
  HandoverRefusedError,
  HandoverTokenNotFoundError,
} from "../../../domain/errors/handover-errors.js";
import { OrderHandoverRepository } from "../../../domain/ports/order-handover.repository.js";
import { FixedOrderLock } from "../../__tests__/fixed-order-lock.js";
import { FixedQualityHolds } from "../../__tests__/fixed-quality-holds.js";
import { FixedTransferStatus } from "../../__tests__/fixed-transfer-status.js";
import { AttestingCounterHandoverDesk } from "../attesting-counter-handover.desk.js";
import { HandoverAttestation } from "../handover-attestation.service.js";

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
  constructor(
    private readonly found: HandoverSubject | null,
    private readonly scanned: HandoverSubject | null = found,
  ) {
    super();
  }

  byToken(): Promise<HandoverSubject | null> {
    return Promise.resolve(this.scanned);
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

function desk(
  found: HandoverSubject | null,
  held: readonly string[] = [],
  scanned: HandoverSubject | null = found,
) {
  const handovers = new Handovers();
  const facts = new Facts();
  const clock = new FixedClock(NOW);
  const attestation = new HandoverAttestation(
    handovers,
    clock,
    new DirectUnitOfWork(),
    facts,
    new FixedQualityHolds(held),
    new FixedTransferStatus(),
    new FixedOrderLock(),
  );
  return {
    handovers,
    facts,
    desk: new AttestingCounterHandoverDesk(new OneSubject(found, scanned), attestation, clock),
  };
}

describe("AttestingCounterHandoverDesk — juger, puis remettre, au comptoir", () => {
  it("juge un retrait du jour remettable sans rien écrire", async () => {
    const { desk: counter, handovers, facts } = desk(subject());

    await counter.vet("ord_1", "staff_9", null);

    expect(handovers.written).toEqual([]);
    expect(facts.facts).toEqual([]);
  });

  it("refuse une livraison (403), sans rien écrire", async () => {
    const { desk: counter, handovers } = desk(subject({ fulfillmentMethod: "delivery" }));

    await expect(counter.vet("ord_1", "staff_9", null)).rejects.toBeInstanceOf(
      CounterOutOfReachError,
    );
    expect(handovers.written).toEqual([]);
  });

  it("refuse un retrait d'un autre jour (403)", async () => {
    const { desk: counter } = desk(subject({ requestedDeliveryDate: serviceDate(1) }));

    await expect(counter.vet("ord_1", "staff_9", null)).rejects.toBeInstanceOf(
      CounterOutOfReachError,
    );
  });

  it("refuse par la règle de remise : non réglée, retenue au contrôle", async () => {
    await expect(
      desk(subject({ settled: false })).desk.vet("ord_1", "s", null),
    ).rejects.toBeInstanceOf(HandoverRefusedError);
    await expect(desk(subject(), ["ord_1"]).desk.vet("ord_1", "s", null)).rejects.toBeInstanceOf(
      HandoverRefusedError,
    );
  });

  it("refuse une commande que le commerce ne sert plus", async () => {
    await expect(desk(null).desk.vet("ord_1", "s", null)).rejects.toBeInstanceOf(
      HandoverRefusedError,
    );
  });

  it("remet en saisie, au nom du vendeur, et écrit le fait du retrait", async () => {
    const { desk: counter, handovers, facts } = desk(subject());

    await counter.handOver("ord_1", "staff_9", null);

    expect(handovers.written).toHaveLength(1);
    expect(handovers.written[0]).toMatchObject({
      orderId: "ord_1",
      rank: 1,
      handedOverBy: "staff_9",
      handedOverAt: NOW,
      via: "manual",
    });
    expect(facts.facts.map((fact) => fact.type)).toEqual(["handover.handed_over"]);
  });

  it("remet en scan quand le jeton lu désigne cette commande (Hugo, 2026-11-03)", async () => {
    const { desk: counter, handovers } = desk(subject());

    await counter.vet("ord_1", "staff_9", "tok_ord_1");
    await counter.handOver("ord_1", "staff_9", "tok_ord_1");

    expect(handovers.written[0]).toMatchObject({ orderId: "ord_1", via: "scan" });
  });

  it("refuse le jeton d'une autre commande, au jugement comme à la remise, sans rien écrire", async () => {
    const other = subject({ orderId: "ord_2", orderNumber: "ORD-0002" });
    const { desk: counter, handovers, facts } = desk(subject(), [], other);

    await expect(counter.vet("ord_1", "staff_9", "tok_ord_2")).rejects.toBeInstanceOf(
      CounterTokenMismatchError,
    );
    await expect(counter.handOver("ord_1", "staff_9", "tok_ord_2")).rejects.toThrow("ORD-0002");
    expect(handovers.written).toEqual([]);
    expect(facts.facts).toEqual([]);
  });

  it("refuse un jeton qui ne désigne aucune commande", async () => {
    const { desk: counter, handovers } = desk(subject(), [], null);

    await expect(counter.vet("ord_1", "staff_9", "tok_x")).rejects.toBeInstanceOf(
      HandoverTokenNotFoundError,
    );
    expect(handovers.written).toEqual([]);
  });
});
