import { type AdminOrderRow, adminOrdersQuerySchema } from "@lfd/contracts";

import { InvalidAdminOrderCursorError } from "../../../domain/errors/admin-order-list-errors.js";
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
    orderNumber: `CMD-${id}`,
    placedAt,
    status: "placed",
    offPlan: false,
    shortfallReportedAt: null,
    paymentStatus: "paid",
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

const queryOf = (raw: Record<string, string>) =>
  new ListAdminOrdersQuery(adminOrdersQuerySchema.parse(raw));

describe("ListAdminOrdersHandler", () => {
  it("rend un curseur sur la DERNIÈRE ligne quand le lecteur en a vu au-delà", async () => {
    const reader = new SlicedReader({
      rows: [rowOf("b", LATEST), rowOf("a", EARLIER)],
      hasMore: true,
      total: 7,
    });

    const page = await new ListAdminOrdersHandler(reader).execute(queryOf({ limit: "2" }));

    expect(page.rows.map((row) => row.id)).toEqual(["b", "a"]);
    const cursor = AdminOrderCursor.decode(page.nextCursor ?? "");
    expect([cursor.placedAt.toISOString(), cursor.orderId]).toEqual([EARLIER, "a"]);
  });

  it("ne rend pas de curseur sur la dernière page", async () => {
    const reader = new SlicedReader({ rows: [rowOf("a", EARLIER)], hasMore: false, total: 0 });

    const page = await new ListAdminOrdersHandler(reader).execute(queryOf({}));

    expect(page.nextCursor).toBeNull();
  });

  it("transmet au lecteur le curseur reçu, relu", async () => {
    const reader = new SlicedReader({ rows: [], hasMore: false, total: 0 });
    const token = AdminOrderCursor.after(new Date(EARLIER), "a").encode();

    await new ListAdminOrdersHandler(reader).execute(
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

    await expect(
      new ListAdminOrdersHandler(reader).execute(queryOf({ cursor: "bricole" })),
    ).rejects.toBeInstanceOf(InvalidAdminOrderCursorError);
    expect(reader.received).toHaveLength(0);
  });

  it("rend le total du lecteur, celui qui numérote les pages", async () => {
    const reader = new SlicedReader({ rows: [rowOf("a", EARLIER)], hasMore: false, total: 51 });

    const page = await new ListAdminOrdersHandler(reader).execute(queryOf({ page: "2" }));

    expect(page.total).toBe(51);
  });
});
