import {
  DeliveryOrdersBroughtBackFact,
  DeliveryRoundDepartedFact,
  DeliveryRoundDepartedPayloadError,
} from "../../../../delivery/channels/handover/index.js";
import { ShipmentRef } from "../../../../production/channels/handover/index.js";
import type { DurableDelivery, DurableEvent } from "../../../../platform/outbox/durable-event.js";
import { HandedOverOrdersReader } from "../../../domain/ports/handed-over-orders.reader.js";
import { OrderDepartureRepository } from "../../../domain/ports/order-departure.repository.js";
import {
  RECORD_ORDERS_BROUGHT_BACK,
  RecordOrdersBroughtBack,
} from "../record-orders-brought-back.handler.js";
import { RECORD_ROUND_DEPARTED, RecordRoundDeparted } from "../record-round-departed.handler.js";

/*
 * Le retrait s'abonne aux faits durables de la livraison
 * (plan-depart-durable.md, DD1) : la garde passe au livreur au départ, et
 * revient au dépôt sur une commande rapportée.
 */

// Des instants comparés entre eux seulement, jamais à l'horloge.
const DEPARTED = new Date(60_000);
const BROUGHT_BACK = new Date(90_000);

/** Ce que l'abonné demande d'écrire — la monotonie, elle, est éprouvée en e2e sur le vrai SQL. */
class RecordingDepartures extends OrderDepartureRepository {
  readonly departed: { readonly orderIds: readonly string[]; readonly at: Date }[] = [];
  readonly returned: { readonly orderIds: readonly string[]; readonly at: Date }[] = [];
  /** Les rangs écrits, toutes écritures confondues. */
  readonly ranks: number[] = [];

  recordDeparted(shipments: readonly ShipmentRef[], at: Date): Promise<void> {
    this.departed.push({ orderIds: this.remember(shipments), at });
    return Promise.resolve();
  }

  recordReturned(shipments: readonly ShipmentRef[], at: Date): Promise<void> {
    this.returned.push({ orderIds: this.remember(shipments), at });
    return Promise.resolve();
  }

  private remember(shipments: readonly ShipmentRef[]): readonly string[] {
    this.ranks.push(...shipments.map((shipment) => shipment.rank));
    return shipments.map((shipment) => shipment.orderId);
  }
}

/** La clé lisible d'un envoi : la commande seule au rang 1, `:r<rang>` au-delà. */
function keyOf(shipment: ShipmentRef): string {
  return shipment.rank === 1 ? shipment.orderId : `${shipment.orderId}:r${String(shipment.rank)}`;
}

class FixedHandedOver extends HandedOverOrdersReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly done: readonly string[] = []) {
    super();
  }

  handedOverAmong(shipments: readonly ShipmentRef[]): Promise<readonly ShipmentRef[]> {
    this.asked.push(shipments.map(keyOf));
    return Promise.resolve(shipments.filter((shipment) => this.done.includes(keyOf(shipment))));
  }
}

/** Le fait tel que le relais le livre : relu de sa charge. */
function delivered(event: DurableEvent): DurableDelivery {
  const { type, payload } = event.durableFact();
  return { eventId: "evt_1", type, payload };
}

/** Des envois de rang 1 — ce que la livraison émet tant que ses arrêts n'ont pas de rang. */
function firsts(orderIds: readonly string[]): readonly ShipmentRef[] {
  return orderIds.map((orderId) => ShipmentRef.firstOf(orderId));
}

describe("RecordRoundDeparted — la garde passe au livreur", () => {
  it("porte un nom d'abonné stable", () => {
    expect(RECORD_ROUND_DEPARTED).toBe("handover.record-round-departed");
  });

  it("retient les commandes parties, à l'instant du départ", async () => {
    const departures = new RecordingDepartures();
    const subject = new RecordRoundDeparted(new FixedHandedOver(), departures);

    await subject.handle(
      delivered(
        new DeliveryRoundDepartedFact("r_1", "2030-03-12", DEPARTED, firsts(["o_1", "o_2"])),
      ),
    );

    expect(departures.departed).toEqual([{ orderIds: ["o_1", "o_2"], at: DEPARTED }]);
  });

  it("🔴 B3 : une commande déjà remise ne « repart » pas", async () => {
    const departures = new RecordingDepartures();
    const handedOver = new FixedHandedOver(["o_1"]);
    const subject = new RecordRoundDeparted(handedOver, departures);

    await subject.handle(
      delivered(
        new DeliveryRoundDepartedFact("r_1", "2030-03-12", DEPARTED, firsts(["o_1", "o_2"])),
      ),
    );

    expect(handedOver.asked).toEqual([["o_1", "o_2"]]);
    expect(departures.departed).toEqual([{ orderIds: ["o_2"], at: DEPARTED }]);
  });

  it("L4b : la garde s'écrit par envoi — le rang 1 et le reliquat partis ensemble, deux lignes", async () => {
    const departures = new RecordingDepartures();
    const subject = new RecordRoundDeparted(new FixedHandedOver(), departures);

    await subject.handle(
      delivered(
        new DeliveryRoundDepartedFact("r_1", "2030-03-12", DEPARTED, [
          ShipmentRef.firstOf("o_1"),
          ShipmentRef.of("o_1", 2),
        ]),
      ),
    );

    expect(departures.departed).toEqual([{ orderIds: ["o_1", "o_1"], at: DEPARTED }]);
    expect(departures.ranks).toEqual([1, 2]);
  });

  it("rejoué, il redemande la même écriture au même instant — l'adaptateur la rend sans effet", async () => {
    const departures = new RecordingDepartures();
    const subject = new RecordRoundDeparted(new FixedHandedOver(), departures);
    const fact = delivered(
      new DeliveryRoundDepartedFact("r_1", "2030-03-12", DEPARTED, firsts(["o_1"])),
    );

    await subject.handle(fact);
    await subject.handle(fact);

    expect(departures.departed).toEqual([
      { orderIds: ["o_1"], at: DEPARTED },
      { orderIds: ["o_1"], at: DEPARTED },
    ]);
  });

  it("L4b : un rang 1 déjà remis ne retient pas son reliquat, qui part seul", async () => {
    const departures = new RecordingDepartures();
    const handedOver = new FixedHandedOver(["o_1"]);
    const subject = new RecordRoundDeparted(handedOver, departures);

    await subject.handle(
      delivered(
        new DeliveryRoundDepartedFact("r_1", "2030-03-12", DEPARTED, [
          ShipmentRef.firstOf("o_1"),
          ShipmentRef.of("o_1", 2),
          ShipmentRef.of("o_1", 2),
        ]),
      ),
    );

    expect(handedOver.asked).toEqual([["o_1", "o_1:r2"]]);
    expect(departures.departed).toEqual([{ orderIds: ["o_1"], at: DEPARTED }]);
    expect(departures.ranks).toEqual([2]);
  });

  it("une charge illisible est une faute d'émetteur : elle lève, et rien ne s'écrit", async () => {
    const departures = new RecordingDepartures();
    const subject = new RecordRoundDeparted(new FixedHandedOver(), departures);

    await expect(
      subject.handle({ eventId: "evt_1", type: "delivery.round_departed", payload: {} }),
    ).rejects.toThrow(DeliveryRoundDepartedPayloadError);
    expect(departures.departed).toEqual([]);
  });
});

describe("RecordOrdersBroughtBack — la garde rentre au dépôt", () => {
  it("porte un nom d'abonné stable", () => {
    expect(RECORD_ORDERS_BROUGHT_BACK).toBe("handover.record-orders-brought-back");
  });

  it("marque revenues les commandes rapportées, à l'instant de la décision", async () => {
    const departures = new RecordingDepartures();

    await new RecordOrdersBroughtBack(departures).handle(
      delivered(new DeliveryOrdersBroughtBackFact("r_1", firsts(["o_1"]), BROUGHT_BACK)),
    );

    expect(departures.returned).toEqual([{ orderIds: ["o_1"], at: BROUGHT_BACK }]);
    expect(departures.departed).toEqual([]);
  });

  it("L4b : rapporte chaque envoi, reliquat compris, une fois", async () => {
    const departures = new RecordingDepartures();
    const shipments = [
      ShipmentRef.firstOf("o_1"),
      ShipmentRef.of("o_1", 2),
      ShipmentRef.of("o_1", 2),
    ];

    await new RecordOrdersBroughtBack(departures).handle(
      delivered(new DeliveryOrdersBroughtBackFact("r_1", shipments, BROUGHT_BACK)),
    );

    expect(departures.returned).toEqual([{ orderIds: ["o_1", "o_1"], at: BROUGHT_BACK }]);
    expect(departures.ranks).toEqual([1, 2]);
  });
});
