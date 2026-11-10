import type { ActivityEventView } from "@lfd/contracts";

import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { OrderHistoryReader } from "../../../domain/ports/order-history.reader.js";
import { GetAdminOrderHistoryHandler } from "../get-admin-order-history.handler.js";
import { GetAdminOrderHistoryQuery } from "../get-admin-order-history.query.js";

/** Un instant comparé à rien : ce n'est qu'une donnée rendue telle quelle. */
const READY: ActivityEventView = {
  id: "evt_2",
  type: "order.ready",
  module: "commandes",
  occurredAt: "2026-10-12T09:00:00.000Z",
  subjectType: "user",
  subjectId: "user_1",
  actorType: "staff",
  actorId: "staff_1",
  actorName: "Hugo",
  actorRole: "admin",
  traceId: "trace_1",
  payload: { orderId: "ord_1" },
};

/** Rend une réponse fixée et garde les commandes demandées. */
class FixedHistoryReader extends OrderHistoryReader {
  readonly asked: string[] = [];

  constructor(private readonly answer: readonly ActivityEventView[] | null) {
    super();
  }

  historyOf(orderId: string): Promise<readonly ActivityEventView[] | null> {
    this.asked.push(orderId);
    return Promise.resolve(this.answer);
  }
}

describe("GetAdminOrderHistoryHandler", () => {
  it("rend les faits lus pour la commande demandée, dans l'ordre du port", async () => {
    const reader = new FixedHistoryReader([READY]);

    const events = await new GetAdminOrderHistoryHandler(reader).execute(
      new GetAdminOrderHistoryQuery("ord_1"),
    );

    expect(events).toEqual([READY]);
    expect(reader.asked).toEqual(["ord_1"]);
  });

  it("rend une liste vide pour une commande sans fait", async () => {
    const handler = new GetAdminOrderHistoryHandler(new FixedHistoryReader([]));

    await expect(handler.execute(new GetAdminOrderHistoryQuery("ord_1"))).resolves.toEqual([]);
  });

  it("refuse une commande inconnue en OrderNotFoundError", async () => {
    const handler = new GetAdminOrderHistoryHandler(new FixedHistoryReader(null));

    await expect(handler.execute(new GetAdminOrderHistoryQuery("absente"))).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });
});
