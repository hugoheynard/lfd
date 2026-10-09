import {
  type HandoverSubject,
  HandoverSubjectReader,
} from "../../../channels/commerce/handover-subject.reader.js";
import { FixedQualityHolds } from "../../__tests__/fixed-quality-holds.js";
import { HandoverDepartureHolds } from "../handover-departure-holds.js";

/*
 * Le retrait répond à la livraison (a-la-porte.md, § 10 ter, BQ) :
 * « lesquelles sont retenues ? » au départ. « Elles sont parties » est un
 * fait durable depuis DD1 : `handlers/__tests__/record-departure-handlers.spec.ts`.
 */

// Des jours et instants recopiés, jamais comparés à l'horloge.
const DAY_A = new Date("2030-03-12T00:00:00.000Z");
const DAY_B = new Date("2030-03-13T00:00:00.000Z");

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
    settled: true,
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
