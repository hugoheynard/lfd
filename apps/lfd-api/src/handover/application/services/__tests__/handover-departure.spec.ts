import {
  type HandoverSubject,
  HandoverSubjectReader,
} from "../../../channels/commerce/handover-subject.reader.js";
import { OrderDepartureRepository } from "../../../domain/ports/order-departure.repository.js";
import { FixedQualityHolds } from "../../__tests__/fixed-quality-holds.js";
import { HandoverDepartedOrders } from "../handover-departed-orders.js";
import { HandoverDepartureHolds } from "../handover-departure-holds.js";

/*
 * Le retrait répond à la livraison (a-la-porte.md, § 10 ter, BQ) :
 * « lesquelles sont retenues ? » au départ, « elles sont parties » après.
 */

// Des jours et instants recopiés, jamais comparés à l'horloge.
const DAY_A = new Date("2030-03-12T00:00:00.000Z");
const DAY_B = new Date("2030-03-13T00:00:00.000Z");
const DEPARTED = new Date(60_000);

function subjectOf(orderId: string, requestedDeliveryDate: Date | null): HandoverSubject {
  return {
    orderId,
    orderNumber: `ORD-${orderId}`,
    placedByUserId: "usr_1",
    customerLabel: "Refuge 1950",
    placedAt: new Date(0),
    requestedDeliveryDate,
    pickupLabel: null,
    status: "ready",
    fulfillmentMethod: "delivery",
    note: "",
    lines: [],
  };
}

class FixedSubjects extends HandoverSubjectReader {
  constructor(private readonly subjects: readonly HandoverSubject[]) {
    super();
  }

  byToken(): Promise<HandoverSubject | null> {
    return Promise.resolve(null);
  }

  byReference(): Promise<HandoverSubject | null> {
    return Promise.resolve(null);
  }

  byOrderId(orderId: string): Promise<HandoverSubject | null> {
    return Promise.resolve(this.subjects.find((subject) => subject.orderId === orderId) ?? null);
  }
}

class RecordingDepartures extends OrderDepartureRepository {
  readonly recorded: { readonly orderIds: readonly string[]; readonly at: Date }[] = [];

  recordDeparted(orderIds: readonly string[], at: Date): Promise<void> {
    this.recorded.push({ orderIds, at });
    return Promise.resolve();
  }

  readonly returned: { readonly orderIds: readonly string[]; readonly at: Date }[] = [];

  recordReturned(orderIds: readonly string[], at: Date): Promise<void> {
    this.returned.push({ orderIds, at });
    return Promise.resolve();
  }
}

describe("HandoverDepartureHolds — « lesquelles sont retenues ? »", () => {
  it("rend les retenues, au jour demandé de chaque commande, une question par jour", async () => {
    const holds = new FixedQualityHolds(["o_2", "o_3"]);
    const reader = new HandoverDepartureHolds(
      new FixedSubjects([
        subjectOf("o_1", DAY_A),
        subjectOf("o_2", DAY_A),
        subjectOf("o_3", DAY_B),
      ]),
      holds,
    );

    const held = await reader.heldOrders(["o_1", "o_2", "o_3"]);

    expect([...held].sort()).toEqual(["o_2", "o_3"]);
    expect(holds.asked).toEqual([
      { serviceDay: "2030-03-12", orderIds: ["o_1", "o_2"] },
      { serviceDay: "2030-03-13", orderIds: ["o_3"] },
    ]);
  });

  it("une commande sans jour demandé, ou que le commerce ne sert plus, n'est jamais retenue", async () => {
    const holds = new FixedQualityHolds(["o_1", "o_9"]);
    const reader = new HandoverDepartureHolds(new FixedSubjects([subjectOf("o_1", null)]), holds);

    const held = await reader.heldOrders(["o_1", "o_9"]);

    expect(held.size).toBe(0);
    expect(holds.asked).toEqual([]);
  });
});

describe("HandoverDepartedOrders — « elles sont parties »", () => {
  it("garde la garde passée par commande, à l'instant du départ", async () => {
    const departures = new RecordingDepartures();

    await new HandoverDepartedOrders(departures).ordersDeparted(["o_1", "o_2"], DEPARTED);

    expect(departures.recorded).toEqual([{ orderIds: ["o_1", "o_2"], at: DEPARTED }]);
  });
});

describe("HandoverDepartedOrders — « elles sont revenues » (B3, LB-Q2)", () => {
  it("marque revenues les commandes rapportées, à l'instant de la décision", async () => {
    const departures = new RecordingDepartures();
    const broughtBack = new Date(90_000);

    await new HandoverDepartedOrders(departures).ordersBroughtBack(["o_1"], broughtBack);

    expect(departures.returned).toEqual([{ orderIds: ["o_1"], at: broughtBack }]);
    expect(departures.recorded).toEqual([]);
  });
});
