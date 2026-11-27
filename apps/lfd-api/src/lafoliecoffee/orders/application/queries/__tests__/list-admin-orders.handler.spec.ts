import { type AdminOrderRow, adminOrdersQuerySchema } from "@lfd/contracts";

import { InscribedOrdersReader } from "../../../../../production/channels/commerce/index.js";
import {
  StaffAuthorDirectory,
  StaffAuthors,
} from "../../../../../staff/directory/domain/staff-author-directory.js";
import {
  InvalidAdminOrderCursorError,
  OrderReviewListNotReadableError,
} from "../../../domain/errors/admin-order-list-errors.js";
import {
  CurrentOrderReviewsReader,
  type CurrentOrderReview,
} from "../../../domain/ports/order-reviews.reader.js";
import {
  AdminOrderListReader,
  type AdminOrderListCriteria,
  type AdminOrderListSlice,
} from "../../../domain/ports/admin-order-list.reader.js";
import { AdminOrderCursor } from "../../../domain/value-objects/admin-order-cursor.js";
import { ListAdminOrdersHandler } from "../list-admin-orders.handler.js";
import { ListAdminOrdersQuery } from "../list-admin-orders.query.js";

/** Les instants ne sont comparés qu'entre eux : ce sont des clés de tri. */
const LATEST = "2026-10-12T09:00:00.000Z";
const EARLIER = "2026-10-12T08:00:00.000Z";

function rowOf(id: string, placedAt: string): AdminOrderRow {
  return {
    id,
    orderNumber: `ORD-${id}`,
    placedAt,
    status: "placed",
    offPlan: false,
    supply: "planned",
    shortfallReportedAt: null,
    paymentStatus: "paid",
    settlement: "paid",
    fulfillmentMethod: "pickup",
    fulfillmentDay: "2026-10-13",
    clientele: "public",
    siteId: null,
    pickupLabel: null,
    fulfillmentWindow: null,
    subtotalCents: 1000,
    vatCents: 55,
    totalCents: 1055,
    customerLabel: "Léa Martin",
    companyId: null,
    companyDisplayName: null,
    origin: "self_service",
    entryOrigin: null,
  };
}

/** Rend une tranche fixée et garde les critères reçus. */
class SlicedReader extends AdminOrderListReader {
  readonly received: AdminOrderListCriteria[] = [];

  constructor(private readonly slice: AdminOrderListSlice) {
    super();
  }

  page(criteria: AdminOrderListCriteria): Promise<AdminOrderListSlice> {
    this.received.push(criteria);
    return Promise.resolve(this.slice);
  }
}

const queryOf = (raw: Record<string, string>, mayReadReviews = true) =>
  new ListAdminOrdersQuery(adminOrdersQuerySchema.parse(raw), mayReadReviews);

/** Des visas en cours fixés, et les lots de commandes demandés. */
class FixedCurrentReviews extends CurrentOrderReviewsReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly current: ReadonlyMap<string, CurrentOrderReview> = new Map()) {
    super();
  }

  of(orderIds: readonly string[]): Promise<ReadonlyMap<string, CurrentOrderReview>> {
    this.asked.push(orderIds);
    return Promise.resolve(this.current);
  }
}

/** Un annuaire qui ne nomme que `stf_1`, et compte ses lectures. */
class OneAuthorDirectory extends StaffAuthorDirectory {
  calls = 0;

  identify(): Promise<StaffAuthors> {
    this.calls += 1;
    return Promise.resolve(
      new StaffAuthors(
        new Map([
          [
            "stf_1",
            {
              staffUserId: "stf_1",
              firstName: "Léa",
              lastName: "Vidal",
              role: "commercial",
              roleLabel: "Commercial",
              jobTitle: "",
            },
          ],
        ]),
      ),
    );
  }
}

/** Le fournil qui a inscrit `inscribed`, et les lots qu'on lui a demandés. */
class FixedInscribedOrders extends InscribedOrdersReader {
  readonly asked: (readonly string[])[] = [];

  constructor(private readonly inscribed: ReadonlySet<string> = new Set()) {
    super();
  }

  inscribedAmong(orderIds: readonly string[]): Promise<ReadonlySet<string>> {
    this.asked.push(orderIds);
    return Promise.resolve(new Set(orderIds.filter((id) => this.inscribed.has(id))));
  }
}

function handlerOf(
  reader: AdminOrderListReader,
  reviews: CurrentOrderReviewsReader = new FixedCurrentReviews(),
  staff: StaffAuthorDirectory = new OneAuthorDirectory(),
  inscribed: InscribedOrdersReader = new FixedInscribedOrders(),
): ListAdminOrdersHandler {
  return new ListAdminOrdersHandler(reader, reviews, staff, inscribed);
}

const offPlanRowOf = (id: string): AdminOrderRow => ({ ...rowOf(id, EARLIER), offPlan: true });

describe("ListAdminOrdersHandler", () => {
  it("rend un curseur sur la DERNIÈRE ligne quand le lecteur en a vu au-delà", async () => {
    const reader = new SlicedReader({
      rows: [rowOf("b", LATEST), rowOf("a", EARLIER)],
      hasMore: true,
      total: 7,
    });

    const page = await handlerOf(reader).execute(queryOf({ limit: "2" }));

    expect(page.rows.map((row) => row.id)).toEqual(["b", "a"]);
    const cursor = AdminOrderCursor.decode(page.nextCursor ?? "");
    expect([cursor.placedAt.toISOString(), cursor.orderId]).toEqual([EARLIER, "a"]);
  });

  it("ne rend pas de curseur sur la dernière page", async () => {
    const reader = new SlicedReader({ rows: [rowOf("a", EARLIER)], hasMore: false, total: 0 });

    const page = await handlerOf(reader).execute(queryOf({}));

    expect(page.nextCursor).toBeNull();
  });

  it("transmet au lecteur le curseur reçu, relu", async () => {
    const reader = new SlicedReader({ rows: [], hasMore: false, total: 0 });
    const token = AdminOrderCursor.after(new Date(EARLIER), "a").encode();

    await handlerOf(reader).execute(
      queryOf({ cursor: token, clientele: "pro", method: "delivery" }),
    );

    expect(reader.received[0]).toMatchObject({
      clientele: "pro",
      method: "delivery",
      after: { orderId: "a" },
    });
  });

  it("refuse un curseur illisible sans interroger le lecteur", async () => {
    const reader = new SlicedReader({ rows: [], hasMore: false, total: 0 });

    await expect(handlerOf(reader).execute(queryOf({ cursor: "bricole" }))).rejects.toBeInstanceOf(
      InvalidAdminOrderCursorError,
    );
    expect(reader.received).toHaveLength(0);
  });

  it("rend le total du lecteur, celui qui numérote les pages", async () => {
    const reader = new SlicedReader({ rows: [rowOf("a", EARLIER)], hasMore: false, total: 51 });

    const page = await handlerOf(reader).execute(queryOf({ page: "2" }));

    expect(page.total).toBe(51);
  });

  it("lit les commandes par défaut, et les seules tentatives abandonnées sur demande", async () => {
    const reader = new SlicedReader({ rows: [], hasMore: false, total: 0 });
    const handler = handlerOf(reader);

    await handler.execute(queryOf({}));
    await handler.execute(queryOf({ view: "abandoned_attempts" }));

    expect(reader.received.map((criteria) => criteria.view)).toEqual([
      "orders",
      "abandoned_attempts",
    ]);
  });

  it("refuse l'onglet « À vérifier » sans le droit de lire les visas, sans interroger le lecteur", async () => {
    const reader = new SlicedReader({ rows: [], hasMore: false, total: 0 });

    await expect(
      handlerOf(reader).execute(queryOf({ view: "to_review" }, false)),
    ).rejects.toBeInstanceOf(OrderReviewListNotReadableError);
    expect(reader.received).toHaveLength(0);
  });

  it("lit l'onglet « À vérifier » avec le droit", async () => {
    const reader = new SlicedReader({ rows: [], hasMore: false, total: 0 });

    await handlerOf(reader).execute(queryOf({ view: "to_review" }));

    expect(reader.received.map((criteria) => criteria.view)).toEqual(["to_review"]);
  });

  it("porte sur chaque ligne son visa en cours, nommé en une lecture de l'annuaire pour la page", async () => {
    const reader = new SlicedReader({
      rows: [rowOf("b", LATEST), rowOf("a", EARLIER), rowOf("c", EARLIER)],
      hasMore: false,
      total: 3,
    });
    const reviews = new FixedCurrentReviews(
      new Map([
        [
          "b",
          { reviewedByStaffId: "stf_1", reviewedAt: new Date(LATEST), revisedSinceReview: false },
        ],
        [
          "a",
          {
            reviewedByStaffId: "stf_gone",
            reviewedAt: new Date(EARLIER),
            revisedSinceReview: true,
          },
        ],
      ]),
    );
    const staff = new OneAuthorDirectory();

    const page = await handlerOf(reader, reviews, staff).execute(queryOf({}));

    expect(page.rows.map((row) => [row.id, row.review, row.revisedSinceReview])).toEqual([
      ["b", { byName: "Léa Vidal", at: LATEST }, false],
      ["a", { byName: null, at: EARLIER }, true],
      ["c", null, false],
    ]);
    expect(reviews.asked).toEqual([["b", "a", "c"]]);
    expect(staff.calls).toBe(1);
  });

  it("éteint « hors plan » d'une commande que le fournil a inscrite, et le garde sinon", async () => {
    const reader = new SlicedReader({
      rows: [offPlanRowOf("in"), offPlanRowOf("out"), rowOf("plan", EARLIER)],
      hasMore: false,
      total: 3,
    });
    const inscribed = new FixedInscribedOrders(new Set(["in", "plan"]));

    const page = await handlerOf(reader, undefined, undefined, inscribed).execute(queryOf({}));

    expect(page.rows.map((row) => [row.id, row.offPlan])).toEqual([
      ["in", false],
      ["out", true],
      ["plan", false],
    ]);
    expect(inscribed.asked).toEqual([["in", "out"]]);
  });

  it("ne demande rien au fournil quand aucune ligne n'est hors plan", async () => {
    const reader = new SlicedReader({ rows: [rowOf("a", EARLIER)], hasMore: false, total: 1 });
    const inscribed = new FixedInscribedOrders(new Set(["a"]));

    await handlerOf(reader, undefined, undefined, inscribed).execute(queryOf({}));

    expect(inscribed.asked).toEqual([]);
  });

  it("refuse une vue inconnue à la forme", () => {
    expect(() => queryOf({ view: "toutes" })).toThrow();
  });
});
