import {
  DeliveryOrdersBroughtBackFact,
  DeliveryRoundDepartedFact,
  DeliveryRoundDepartedPayloadError,
} from "../../../../delivery/channels/handover/index.js";
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

  recordDeparted(orderIds: readonly string[], at: Date): Promise<void> {
    this.departed.push({ orderIds, at });
    return Promise.resolve();
  }

  recordReturned(orderIds: readonly string[], at: Date): Promise<void> {
    this.returned.push({ orderIds, at });
    return Promise.resolve();
  }
}

class FixedHandedOver extends HandedOverOrdersReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly done: readonly string[] = []) {
    super();
  }

  handedOverAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    this.asked.push(orderIds);
    return Promise.resolve(new Set(orderIds.filter((id) => this.done.includes(id))));
  }
}

/** Le fait tel que le relais le livre : relu de sa charge. */
function delivered(event: DurableEvent): DurableDelivery {
  const { type, payload } = event.durableFact();
  return { eventId: "evt_1", type, payload };
}

describe("RecordRoundDeparted — la garde passe au livreur", () => {
  it("porte un nom d'abonné stable", () => {
    expect(RECORD_ROUND_DEPARTED).toBe("handover.record-round-departed");
  });

  it("retient les commandes parties, à l'instant du départ", async () => {
    const departures = new RecordingDepartures();
    const subject = new RecordRoundDeparted(new FixedHandedOver(), departures);

    await subject.handle(
      delivered(new DeliveryRoundDepartedFact("r_1", "2030-03-12", DEPARTED, ["o_1", "o_2"])),
    );

    expect(departures.departed).toEqual([{ orderIds: ["o_1", "o_2"], at: DEPARTED }]);
  });

  it("🔴 B3 : une commande déjà remise ne « repart » pas", async () => {
    const departures = new RecordingDepartures();
    const handedOver = new FixedHandedOver(["o_1"]);
    const subject = new RecordRoundDeparted(handedOver, departures);

    await subject.handle(
      delivered(new DeliveryRoundDepartedFact("r_1", "2030-03-12", DEPARTED, ["o_1", "o_2"])),
    );

    expect(handedOver.asked).toEqual([["o_1", "o_2"]]);
    expect(departures.departed).toEqual([{ orderIds: ["o_2"], at: DEPARTED }]);
  });

  it("rejoué, il redemande la même écriture au même instant — l'adaptateur la rend sans effet", async () => {
    const departures = new RecordingDepartures();
    const subject = new RecordRoundDeparted(new FixedHandedOver(), departures);
    const fact = delivered(new DeliveryRoundDepartedFact("r_1", "2030-03-12", DEPARTED, ["o_1"]));

    await subject.handle(fact);
    await subject.handle(fact);

    expect(departures.departed).toEqual([
      { orderIds: ["o_1"], at: DEPARTED },
      { orderIds: ["o_1"], at: DEPARTED },
    ]);
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
      delivered(new DeliveryOrdersBroughtBackFact("r_1", ["o_1"], BROUGHT_BACK)),
    );

    expect(departures.returned).toEqual([{ orderIds: ["o_1"], at: BROUGHT_BACK }]);
    expect(departures.departed).toEqual([]);
  });
});
