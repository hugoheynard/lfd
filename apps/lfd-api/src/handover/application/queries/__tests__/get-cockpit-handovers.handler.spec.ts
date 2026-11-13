import { HandoverQueueReader, type HandoverQueueEntry } from "../../../channels/commerce/index.js";
import {
  HandoverAttestationsReader,
  type AttestedHandover,
} from "../../../domain/ports/handover-attestations.reader.js";
import { GetCockpitHandoversHandler } from "../get-cockpit-handovers.handler.js";
import { GetCockpitHandoversQuery } from "../get-cockpit-handovers.query.js";

/**
 * Les chiffres du cockpit commercial : les mêmes lignes que la file de la
 * journée entière, comptées par acheminement, annulées et non réglées exclues.
 */

const PLACED_AT = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

function entry(overrides: Partial<HandoverQueueEntry> = {}): HandoverQueueEntry {
  return {
    orderId: "ord_1",
    reference: "ORD-ABCD-1234",
    customerLabel: "Les Halles",
    tradeName: null,
    clientele: "pro",
    pickupLabel: "Le labo",
    siteId: "site_labo",
    fulfillmentMethod: "pickup",
    window: null,
    totalUnits: 3,
    abandoned: [],
    status: "ready",
    settled: true,
    readyAt: null,
    placedAt: PLACED_AT,
    ...overrides,
  };
}

const ATTESTED: AttestedHandover = {
  handedOverAt: new Date(Date.now() - 60 * 60 * 1000),
  handedOverBy: "staff-1",
  via: "scan",
};

class FixedQueue extends HandoverQueueReader {
  readonly calls: string[] = [];
  constructor(private readonly entries: readonly HandoverQueueEntry[]) {
    super();
  }
  expectedOn(day: string): Promise<readonly HandoverQueueEntry[]> {
    this.calls.push(day);
    return Promise.resolve(this.entries);
  }
}

class FixedAttestations extends HandoverAttestationsReader {
  readonly calls: (readonly string[])[] = [];
  constructor(private readonly attested: ReadonlyMap<string, AttestedHandover>) {
    super();
  }
  forOrders(orderIds: readonly string[]): Promise<ReadonlyMap<string, AttestedHandover>> {
    this.calls.push(orderIds);
    return Promise.resolve(this.attested);
  }
}

function handlerOf(
  entries: readonly HandoverQueueEntry[],
  attested: ReadonlyMap<string, AttestedHandover> = new Map(),
) {
  const queue = new FixedQueue(entries);
  const attestations = new FixedAttestations(attested);
  return { handler: new GetCockpitHandoversHandler(queue, attestations), queue, attestations };
}

describe("GetCockpitHandoversHandler", () => {
  it("compte retraits et livraisons séparément, et ce qui est déjà remis", async () => {
    const { handler } = handlerOf(
      [
        entry({ orderId: "r1" }),
        entry({ orderId: "r2" }),
        entry({ orderId: "l1", fulfillmentMethod: "delivery", pickupLabel: null }),
        entry({ orderId: "l2", fulfillmentMethod: "delivery", pickupLabel: null }),
        entry({ orderId: "l3", fulfillmentMethod: "delivery", pickupLabel: null }),
      ],
      new Map([
        ["r1", ATTESTED],
        ["l2", ATTESTED],
      ]),
    );

    const view = await handler.execute(new GetCockpitHandoversQuery("2026-09-10"));

    expect(view).toEqual({
      day: "2026-09-10",
      pickup: { expected: 2, done: 1 },
      delivery: { expected: 3, done: 1 },
    });
  });

  it("n'attend pas une commande annulée, mais compte une annulée déjà remise", async () => {
    const { handler } = handlerOf(
      [
        entry({ orderId: "cancelled", status: "cancelled" }),
        entry({ orderId: "gone", status: "cancelled" }),
      ],
      new Map([["gone", ATTESTED]]),
    );

    const view = await handler.execute(new GetCockpitHandoversQuery("2026-09-10"));

    expect(view.pickup).toEqual({ expected: 1, done: 1 });
  });

  it("ne compte pas une commande ni réglée ni remise — la file ne la montre pas", async () => {
    const { handler } = handlerOf([entry({ settled: false, status: "pending" })]);

    const view = await handler.execute(new GetCockpitHandoversQuery("2026-09-10"));

    expect(view.pickup).toEqual({ expected: 0, done: 0 });
  });

  it("pose deux lectures en lot, jamais une par ligne", async () => {
    const { handler, queue, attestations } = handlerOf([
      entry({ orderId: "a" }),
      entry({ orderId: "b", fulfillmentMethod: "delivery" }),
    ]);

    await handler.execute(new GetCockpitHandoversQuery("2026-09-10"));

    expect(queue.calls).toEqual(["2026-09-10"]);
    expect(attestations.calls).toEqual([["a", "b"]]);
  });
});
