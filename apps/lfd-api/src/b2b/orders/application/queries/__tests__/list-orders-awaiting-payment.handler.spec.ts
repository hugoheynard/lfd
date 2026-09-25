import { OrderMailOrigins } from "../../../domain/ports/order-mail-origins.js";
import {
  OrderPaymentLinkReader,
  type OrderPaymentStanding,
} from "../../../domain/ports/order-payment-link.reader.js";
import { ListOrdersAwaitingPaymentHandler } from "../list-orders-awaiting-payment.handler.js";

const PLACED = new Date("2026-01-10T09:00:00.000Z");

const PENDING: OrderPaymentStanding = {
  orderId: "order_1",
  reference: "ORD-1",
  companyId: "co_1",
  companyName: "Les Halles",
  totalCents: 14_400,
  placedAt: PLACED,
  status: "placed",
  paymentStatus: "pending",
  placedByUserId: "user_1",
};

class FixedStandings extends OrderPaymentLinkReader {
  constructor(private readonly rows: readonly OrderPaymentStanding[]) {
    super();
  }

  listAwaitingPayment(): Promise<readonly OrderPaymentStanding[]> {
    return Promise.resolve(this.rows);
  }

  findStanding(): Promise<OrderPaymentStanding | null> {
    return Promise.reject(new Error("La liste n'a pas à relire une commande."));
  }
}

class Origins extends OrderMailOrigins {
  constructor(private readonly client: string | null) {
    super();
  }

  clientBaseUrl(): string | null {
    return this.client;
  }

  adminBaseUrl(): string | null {
    return null;
  }
}

function list(client: string | null) {
  return new ListOrdersAwaitingPaymentHandler(
    new FixedStandings([PENDING]),
    new Origins(client),
  ).execute();
}

describe("ListOrdersAwaitingPaymentHandler", () => {
  it("rend chaque commande avec son lien de règlement", async () => {
    expect(await list("https://app.lfc.test")).toEqual([
      {
        orderId: "order_1",
        reference: "ORD-1",
        companyId: "co_1",
        companyName: "Les Halles",
        totalCents: 14_400,
        placedAt: PLACED.toISOString(),
        status: "placed",
        paymentStatus: "pending",
        paymentUrl: "https://app.lfc.test/commandes/order_1/regler",
      },
    ]);
  });

  it("sans CLIENT_BASE_URL, rend la ligne SANS lien plutôt qu'un lien inventé", async () => {
    const [row] = await list(null);
    expect(row?.paymentUrl).toBeNull();
  });
});
