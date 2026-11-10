import type { OrderStatus, OrderView, PaymentStatus } from "@lfd/contracts";

import type { CardIntentState } from "../../../../../card-payment/channels/requests/index.js";
import { OrderNotFoundError, OrderNotPayableError } from "../../../domain/errors/order-errors.js";
import {
  CancelledOrderNotPayableError,
  OrderPaymentAwaitsAdoptionError,
  PaymentIntentClosedError,
} from "../../../domain/errors/order-payment-errors.js";
import { OrderCardRetrieval } from "../../../domain/ports/order-card-payments.js";
import { OrderAccessReader } from "../../../domain/ports/order-access.reader.js";
import { OrderReader, type OwnedOrder } from "../../../domain/ports/order.reader.js";
import { orderView } from "../../handlers/__tests__/payment-failure-doubles.js";
import { GetOrderPaymentHandler } from "../get-order-payment.handler.js";
import { GetOrderPaymentQuery } from "../get-order-payment.query.js";
import { AT_PLACEMENT } from "../../../domain/services/order-sheet.js";

/** Une commande réduite à ce que ce handler lit. */
function owned(over: {
  readonly paymentStatus: PaymentStatus;
  readonly status?: OrderStatus;
  readonly stripePaymentIntentId?: string | null;
  readonly placedByUserId?: string;
}): OwnedOrder {
  const view: OrderView = {
    ...orderView(over.status ?? "placed", over.paymentStatus),
    totalCents: 12_345,
  };
  return {
    view,
    companyId: null,
    placedByUserId: over.placedByUserId ?? "u1",
    stripePaymentIntentId:
      over.stripePaymentIntentId === undefined ? "pi_1" : over.stripePaymentIntentId,
    clientele: "public",
    entryOrigin: null,
    loyaltyVoucherId: null,
    billedCustomer: null,
    buyerPhone: null,
    revision: AT_PLACEMENT,
  };
}

function reader(order: OwnedOrder | null): OrderReader {
  return {
    listForProduction: () => Promise.resolve([]),
    listPersonal: () => Promise.resolve([]),
    findById: () => Promise.resolve(order),
    findAuthorByReference: () => Promise.resolve(null),
    findForPacking: () => Promise.reject(new Error("non utilisé")),
  };
}

const guard: OrderAccessReader = {
  accessToOrder: () => Promise.resolve(null),
};

/**
 * Le premier paiement relu par le bloc `card-payment` (plan M2, P0.c2) : la
 * commande demandée est notée ; `awaitsAdoption` simule une intention d'avant
 * le bloc, sans ligne.
 */
class FixedRetrieval extends OrderCardRetrieval {
  constructor(
    private readonly sink: { retrieved: string | null },
    private readonly state: CardIntentState,
    private readonly awaitsAdoption: boolean,
  ) {
    super();
  }

  retrieveFirst(orderId: string) {
    this.sink.retrieved = orderId;
    if (this.awaitsAdoption) {
      return Promise.reject(new OrderPaymentAwaitsAdoptionError(orderId));
    }
    return Promise.resolve({
      paymentId: "pay_1",
      providerRef: "pi_1",
      clientSecret: "pi_1_secret",
      publishableKey: "pk_test_123",
      state: this.state,
    });
  }
}

function payments(
  sink: { retrieved: string | null } = { retrieved: null },
  state: CardIntentState = "awaiting_payment",
  awaitsAdoption = false,
): OrderCardRetrieval {
  return new FixedRetrieval(sink, state, awaitsAdoption);
}

describe("GetOrderPaymentHandler", () => {
  /**
   * Plan M2, §4.6 (lot P0.c2) : une intention ouverte avant le bloc
   * `card-payment` n'a pas de ligne. La page la dit « à adopter » et n'écrit
   * rien — c'est l'écran qui envoie l'adoption, puis relit.
   */
  it("dit « à adopter » une intention d'avant le bloc, sans rien écrire", async () => {
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "pending" })),
      payments(undefined, "awaiting_payment", true),
    );

    await expect(handler.execute(new GetOrderPaymentQuery("u1", "order_1"))).rejects.toBeInstanceOf(
      OrderPaymentAwaitsAdoptionError,
    );
  });

  it("rend de quoi payer une commande en attente", async () => {
    const sink = { retrieved: null as string | null };
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "pending" })),
      payments(sink),
    );

    const intent = await handler.execute(new GetOrderPaymentQuery("u1", "order_1"));

    expect(intent).toEqual({
      clientSecret: "pi_1_secret",
      publishableKey: "pk_test_123",
      amountCents: 12_345,
    });
    // Le secret est REDEMANDÉ au prestataire : on ne stocke que l'identifiant.
    expect(sink.retrieved).toBe("order_1");
  });

  it("refuse une commande déjà réglée — sans prétendre qu'elle a disparu", async () => {
    // Un client qui suit un lien périmé doit comprendre que sa commande va bien.
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "paid" })),
      payments(),
    );

    await expect(handler.execute(new GetOrderPaymentQuery("u1", "order_1"))).rejects.toBeInstanceOf(
      OrderNotPayableError,
    );
  });

  it("refuse une commande portée au compte : il n'y a rien à encaisser", async () => {
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "not_required", stripePaymentIntentId: null })),
      payments(),
    );

    await expect(handler.execute(new GetOrderPaymentQuery("u1", "order_1"))).rejects.toBeInstanceOf(
      OrderNotPayableError,
    );
  });

  it("refuse un `pending` sans intention plutôt que d'appeler le prestataire", async () => {
    const sink = { retrieved: null as string | null };
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "pending", stripePaymentIntentId: null })),
      payments(sink),
    );

    await expect(handler.execute(new GetOrderPaymentQuery("u1", "order_1"))).rejects.toBeInstanceOf(
      OrderNotPayableError,
    );
    expect(sink.retrieved).toBeNull();
  });

  it("mure : la commande d'un autre client est introuvable", async () => {
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "pending", placedByUserId: "someone_else" })),
      payments(),
    );

    await expect(handler.execute(new GetOrderPaymentQuery("u1", "order_1"))).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });

  it("404 quand la commande n'existe pas", async () => {
    const handler = new GetOrderPaymentHandler(guard, reader(null), payments());

    await expect(handler.execute(new GetOrderPaymentQuery("u1", "order_1"))).rejects.toBeInstanceOf(
      OrderNotFoundError,
    );
  });

  it("refuse une commande annulée sans même interroger le prestataire", async () => {
    const sink = { retrieved: null as string | null };
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "pending", status: "cancelled" })),
      payments(sink),
    );

    await expect(handler.execute(new GetOrderPaymentQuery("u1", "order_1"))).rejects.toBeInstanceOf(
      CancelledOrderNotPayableError,
    );
    expect(sink.retrieved).toBeNull();
  });

  it("refuse une commande annulée même si sa colonne de paiement a été marquée échouée", async () => {
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "failed", status: "cancelled" })),
      payments(),
    );

    await expect(handler.execute(new GetOrderPaymentQuery("u1", "order_1"))).rejects.toBeInstanceOf(
      CancelledOrderNotPayableError,
    );
  });

  it("ne sert pas le secret d'une intention annulée chez Stripe (écriture perdue chez nous)", async () => {
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "pending" })),
      payments(undefined, "canceled"),
    );

    const refusal = handler.execute(new GetOrderPaymentQuery("u1", "order_1"));
    await expect(refusal).rejects.toBeInstanceOf(PaymentIntentClosedError);
    await expect(refusal).rejects.toMatchObject({ state: "canceled" });
  });

  it("ne fait pas payer deux fois : une intention déjà encaissée est refusée", async () => {
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "pending" })),
      payments(undefined, "succeeded"),
    );

    const refusal = handler.execute(new GetOrderPaymentQuery("u1", "order_1"));
    await expect(refusal).rejects.toBeInstanceOf(PaymentIntentClosedError);
    await expect(refusal).rejects.toMatchObject({ state: "succeeded" });
  });

  it("sert encore une intention en cours de traitement : l'écran de règlement en dira l'issue", async () => {
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "pending" })),
      payments(undefined, "processing"),
    );

    const intent = await handler.execute(new GetOrderPaymentQuery("u1", "order_1"));
    expect(intent.clientSecret).toBe("pi_1_secret");
  });

  it("sert une commande `failed` dont l'intention est vivante : la carte refusée se reprend", async () => {
    const sink = { retrieved: null as string | null };
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "failed" })),
      payments(sink, "awaiting_payment"),
    );

    const intent = await handler.execute(new GetOrderPaymentQuery("u1", "order_1"));

    expect(intent.clientSecret).toBe("pi_1_secret");
    // La MÊME intention : aucune nouvelle n'est créée.
    expect(sink.retrieved).toBe("order_1");
  });

  it("refuse une commande `failed` dont l'intention a été annulée chez Stripe", async () => {
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "failed" })),
      payments(undefined, "canceled"),
    );

    const refusal = handler.execute(new GetOrderPaymentQuery("u1", "order_1"));
    await expect(refusal).rejects.toBeInstanceOf(PaymentIntentClosedError);
    await expect(refusal).rejects.toMatchObject({ state: "canceled" });
  });

  it("refuse une commande `failed` sans intention, sans appeler le prestataire", async () => {
    const sink = { retrieved: null as string | null };
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "failed", stripePaymentIntentId: null })),
      payments(sink),
    );

    await expect(handler.execute(new GetOrderPaymentQuery("u1", "order_1"))).rejects.toBeInstanceOf(
      OrderNotPayableError,
    );
    expect(sink.retrieved).toBeNull();
  });

  it("refuse une commande remboursée : il n'y a plus rien à encaisser", async () => {
    const handler = new GetOrderPaymentHandler(
      guard,
      reader(owned({ paymentStatus: "refunded" })),
      payments(),
    );

    await expect(handler.execute(new GetOrderPaymentQuery("u1", "order_1"))).rejects.toBeInstanceOf(
      OrderNotPayableError,
    );
  });
});
