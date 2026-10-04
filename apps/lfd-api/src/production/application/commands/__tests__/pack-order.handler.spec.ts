import { legacyOf, RecordingStation } from "../../../application/__tests__/station-doubles.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import type { DurableFact } from "../../../../platform/outbox/durable-event.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import type { ProducibleOrder } from "../../../channels/commerce/day-orders.reader.js";
import { OrderPackedEvent } from "../../../channels/commerce/order-packed.event.js";
import { ProductionDay } from "../../../domain/entities/production-day.js";
import { ProductionDayRepository } from "../../../domain/ports/production-day.repository.js";
import { ServiceDay } from "../../../domain/value-objects/service-day.value-object.js";
import { PackOrderCommand } from "../pack-order.command.js";
import { PackOrderHandler } from "../pack-order.handler.js";

// Dates comparées entre elles seulement : l'horloge est figée par `FixedClock`.
const CLOSED_AT = new Date("2026-09-07T18:00:00.000Z");
const NOW = new Date("2026-09-08T05:00:00.000Z");
const FIRST_SCAN = new Date("2026-09-08T04:00:00.000Z");
const DAY = "2026-09-08";
const REFERENCE = "CMD-0001";
const ORDER_ID = "ord_1";

const ORDER: ProducibleOrder = {
  orderId: ORDER_ID,
  reference: REFERENCE,
  customerLabel: "Trois Ponts",
  fulfillmentMethod: "pickup",
  destination: "Le Labo",
  dueAt: null,
  lines: [{ sku: "VIE-001", productName: "Croissant", quantity: 4 }],
};

function closedDay(): ProductionDay {
  const opened = ProductionDay.open(ServiceDay.of(DAY));
  opened.close([ORDER], CLOSED_AT);
  // L'ancien poste : depuis K2, une clôture naît au colisage.
  const day = legacyOf(opened);
  return day;
}

/** Une unité de travail qui sait si elle est OUVERTE, sans transactionner. */
class ObservedUnitOfWork extends UnitOfWork {
  open = false;

  async run<T>(work: () => Promise<T>): Promise<T> {
    this.open = true;
    try {
      return await work();
    } finally {
      this.open = false;
    }
  }
}

/** La boîte d'envoi doublée : elle refuse hors unité de travail, comme le vrai port. */
class Durable extends DurablePublisher {
  readonly facts: DurableFact[] = [];

  constructor(private readonly uow: ObservedUnitOfWork) {
    super();
  }

  publish(fact: DurableFact): Promise<void> {
    if (!this.uow.open) {
      return Promise.reject(new Error("fait durable hors unité de travail"));
    }
    this.facts.push(fact);
    return Promise.resolve();
  }
}

/**
 * Le dépôt doublé. `markPacked` rend ce que la base rendrait : `true` si la
 * ligne était libre, `false` si un autre poste l'a fermée entre-temps — ce que
 * `rival` simule en colisant la journée relue juste avant l'écriture.
 */
class Days extends ProductionDayRepository {
  rival: { readonly at: Date; readonly by: string } | null = null;
  readonly packedInsideUnitOfWork: boolean[] = [];

  constructor(
    private current: ProductionDay,
    private readonly uow: ObservedUnitOfWork,
  ) {
    super();
  }

  load(): Promise<ProductionDay> {
    return Promise.resolve(this.current);
  }

  save(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  markPacked(): Promise<boolean> {
    this.packedInsideUnitOfWork.push(this.uow.open);
    if (this.rival !== null) {
      const winner = closedDay();
      winner.pack(REFERENCE, this.rival.at, this.rival.by);
      this.current = winner;
      return Promise.resolve(false);
    }
    return Promise.resolve(true);
  }

  markPackedLine(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  recordContainerCount(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }

  stepContainerCount(): Promise<boolean> {
    return Promise.reject(new Error("non utilisé"));
  }
}

function subject(day: ProductionDay) {
  const uow = new ObservedUnitOfWork();
  const days = new Days(day, uow);
  const durable = new Durable(uow);
  const station = new RecordingStation();
  const handler = new PackOrderHandler(days, new FixedClock(NOW), uow, durable, station);
  return { days, durable, handler, station };
}

const pack = (by = "staff_a") => new PackOrderCommand(DAY, REFERENCE, by);

describe("coliser une commande", () => {
  it("écrit le colisage ET le fait durable dans la même unité de travail", async () => {
    const { handler, days, durable } = subject(closedDay());

    const ack = await handler.execute(pack());

    expect(ack).toEqual({
      reference: REFERENCE,
      packedAt: NOW.toISOString(),
      packedBy: "staff_a",
      alreadyPacked: false,
    });
    expect(days.packedInsideUnitOfWork).toEqual([true]);
    expect(durable.facts).toEqual([
      new OrderPackedEvent(ORDER_ID, REFERENCE, NOW, "staff_a").durableFact(),
    ]);
  });

  it("porte une clé déterministe par commande, et un contrat sans forme Prisma", async () => {
    const { handler, durable } = subject(closedDay());

    await handler.execute(pack());

    expect(durable.facts[0]).toEqual({
      type: "production.order_packed",
      key: `production.order_packed:${ORDER_ID}`,
      payload: {
        orderId: ORDER_ID,
        reference: REFERENCE,
        packedAt: NOW.toISOString(),
        packedBy: "staff_a",
      },
    });
  });

  it("le poste qui PERD la course n'écrit aucun fait, et répond avec le gagnant", async () => {
    const { handler, days, durable } = subject(closedDay());
    days.rival = { at: FIRST_SCAN, by: "staff_b" };

    const ack = await handler.execute(pack());

    expect(durable.facts).toEqual([]);
    expect(ack).toEqual({
      reference: REFERENCE,
      packedAt: FIRST_SCAN.toISOString(),
      packedBy: "staff_b",
      alreadyPacked: true,
    });
  });

  it("le rescan d'un bac fait est un fait NEUF, daté du premier colisage", async () => {
    // Le filet humain : un commerce resté en arrière se rattrape en rescannant.
    // Dédupliqué par la clé du colisage, le rescan ne livrerait rien.
    const day = closedDay();
    day.pack(REFERENCE, FIRST_SCAN, "staff_b");
    const { handler, days, durable } = subject(day);

    const ack = await handler.execute(pack());

    expect(days.packedInsideUnitOfWork).toEqual([]);
    expect(ack.alreadyPacked).toBe(true);
    expect(ack.packedAt).toBe(FIRST_SCAN.toISOString());
    const [fact] = durable.facts;
    expect(fact?.key).toBe(`production.order_packed:${ORDER_ID}:reannounced:${NOW.toISOString()}`);
    expect(fact?.payload).toMatchObject({
      packedAt: FIRST_SCAN.toISOString(),
      packedBy: "staff_b",
    });
  });
});

describe("le contrat `production.order_packed`", () => {
  it("se relit à l'identique côté abonné", () => {
    const event = new OrderPackedEvent(ORDER_ID, REFERENCE, FIRST_SCAN, "staff_b");

    expect(OrderPackedEvent.fromPayload(event.durableFact().payload)).toEqual(event);
  });

  it.each([
    { reference: REFERENCE, packedAt: FIRST_SCAN.toISOString(), packedBy: "s" },
    { orderId: ORDER_ID, packedAt: FIRST_SCAN.toISOString(), packedBy: "s" },
    { orderId: ORDER_ID, reference: REFERENCE, packedAt: "pas une date", packedBy: "s" },
    { orderId: ORDER_ID, reference: REFERENCE, packedAt: FIRST_SCAN.toISOString() },
  ])("refuse un payload hors forme (%o)", (payload) => {
    expect(() => OrderPackedEvent.fromPayload(payload)).toThrow("illisible");
  });
});

describe("une journée `packing` (colisage, K2)", () => {
  function packingDay(): ProductionDay {
    const opened = ProductionDay.open(ServiceDay.of(DAY));
    opened.close([ORDER], CLOSED_AT);
    return opened;
  }

  it("remet la fermeture au colisage — qui publie — et rend son accusé tel quel", async () => {
    const { handler, durable, station } = subject(packingDay());

    const ack = await handler.execute(pack());

    expect(station.calls).toEqual([`seal:${ORDER_ID}:staff_a`]);
    expect(durable.facts).toEqual([]);
    expect(ack).toEqual({
      reference: REFERENCE,
      packedAt: NOW.toISOString(),
      packedBy: "staff_a",
      alreadyPacked: false,
    });
  });

  it("un rescan rend l'accusé d'ORIGINE que le colisage a gardé", async () => {
    const { handler, station } = subject(packingDay());
    station.sealAck = { packedAt: FIRST_SCAN, packedBy: "staff_a", alreadyPacked: true };

    const ack = await handler.execute(pack("staff_b"));

    expect(ack).toEqual({
      reference: REFERENCE,
      packedAt: FIRST_SCAN.toISOString(),
      packedBy: "staff_a",
      alreadyPacked: true,
    });
  });
});
