import {
  addDays,
  AUDIENCE_DIMENSIONS,
  instantToLocal,
  type AudienceDimension,
} from "@lfd/contracts";

import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  AudienceFamilyReader,
  type AudienceFamily,
} from "../../../domain/ports/audience-family.reader.js";
import {
  AudienceOrderReader,
  type AudienceSkuRevenue,
  type AudienceTally,
} from "../../../domain/ports/audience-order.reader.js";
import { GetAudiencesHandler } from "../get-audiences.handler.js";
import { GetAudiencesQuery } from "../get-audiences.query.js";

const NOW = new Date("2026-10-18T08:00:00.000Z");
const TODAY = instantToLocal(NOW).day;

const tally = (over: Partial<AudienceTally>): AudienceTally => ({
  rawKey: "pro",
  rawLabel: null,
  clients: 6,
  orders: 8,
  revenueHtCents: 8_000,
  revenueTtcCents: 8_440,
  ...over,
});

/** Les agrégats d'une commande doublée : une table par coupe, et les questions posées. */
class FixedOrders extends AudienceOrderReader {
  readonly asked: { dimension: AudienceDimension | "subscriptions"; from: string; to: string }[] =
    [];
  constructor(
    private readonly tallies: Partial<Record<AudienceDimension, readonly AudienceTally[]>>,
    private readonly subscription: AudienceTally | null = null,
  ) {
    super();
  }
  tally(dimension: AudienceDimension, from: string, to: string): Promise<readonly AudienceTally[]> {
    this.asked.push({ dimension, from, to });
    return Promise.resolve(this.tallies[dimension] ?? []);
  }
  skuRevenue(dimension: AudienceDimension): Promise<readonly AudienceSkuRevenue[]> {
    return Promise.resolve(
      (this.tallies[dimension] ?? []).map((row) => ({
        rawKey: row.rawKey,
        sku: "PAI-001",
        revenueHtCents: row.revenueHtCents,
      })),
    );
  }
  subscriptionTally(from: string, to: string): Promise<AudienceTally | null> {
    this.asked.push({ dimension: "subscriptions", from, to });
    return Promise.resolve(this.subscription);
  }
  subscriptionSkuRevenue(): Promise<readonly AudienceSkuRevenue[]> {
    return Promise.resolve([]);
  }
}

class FixedFamilies extends AudienceFamilyReader {
  readonly asked: (readonly string[])[] = [];
  familiesOf(skus: readonly string[]): Promise<ReadonlyMap<string, AudienceFamily>> {
    this.asked.push(skus);
    return Promise.resolve(new Map([["PAI-001", { id: "fam-pains", name: "Pains" }]]));
  }
}

function handler(orders: FixedOrders, families = new FixedFamilies()): GetAudiencesHandler {
  return new GetAudiencesHandler(orders, families, new FixedClock(NOW));
}

describe("GetAudiencesHandler", () => {
  it("lit les sept coupes sur la période finissant aujourd'hui, jour métier", async () => {
    const orders = new FixedOrders({});
    const view = await handler(orders).execute(new GetAudiencesQuery(7, null));

    expect(view).toMatchObject({ days: 7, from: addDays(TODAY, -6), to: TODAY, minClients: 5 });
    expect(view.segmentations.map((segmentation) => segmentation.dimension)).toEqual([
      ...AUDIENCE_DIMENSIONS,
    ]);
    expect(orders.asked).toContainEqual({
      dimension: "moment",
      from: addDays(TODAY, -6),
      to: TODAY,
    });
  });

  it("ne lit qu'une coupe quand on la nomme, et attache ses familles en tête", async () => {
    const orders = new FixedOrders({ clientele: [tally({ rawKey: "public" })] });
    const view = await handler(orders).execute(new GetAudiencesQuery(30, "clientele"));

    expect(view.segmentations).toEqual([
      {
        dimension: "clientele",
        cells: [
          { status: "too_few_clients", key: "pro", label: "Professionnels" },
          expect.objectContaining({
            status: "shown",
            key: "public",
            clients: 6,
            averageBasketHtCents: 1_000,
            averageBasketTtcCents: 1_055,
            topFamilies: [{ familyId: "fam-pains", name: "Pains", revenueHtCents: 8_000 }],
          }),
        ],
      },
    ]);
  });

  it("masque une case de quatre clients même riche en commandes", async () => {
    const orders = new FixedOrders({
      fulfillment: [tally({ rawKey: "delivery", clients: 4, orders: 40 })],
    });
    const view = await handler(orders).execute(new GetAudiencesQuery(90, "fulfillment"));
    expect(view.segmentations[0]?.cells).toEqual([
      { status: "too_few_clients", key: "pickup", label: "Retrait" },
      { status: "too_few_clients", key: "delivery", label: "Livraison" },
    ]);
  });

  it("met les abonnements à part, sous le même seuil", async () => {
    const none = await handler(new FixedOrders({})).execute(new GetAudiencesQuery(30, "loyalty"));
    expect(none.subscriptions).toEqual({
      status: "too_few_clients",
      key: "subscriptions",
      label: "Commandes d'abonnement",
    });

    const some = await handler(new FixedOrders({}, tally({ rawKey: "all" }))).execute(
      new GetAudiencesQuery(30, "loyalty"),
    );
    expect(some.subscriptions).toMatchObject({ status: "shown", clients: 6, orders: 8 });
  });
});
