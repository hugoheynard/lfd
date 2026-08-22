import type { OrderView, PaymentStatus } from "@lfd/contracts";

import { PaymentGateway } from "../../../../payments/domain/payment-gateway.js";
import { OrderNotFoundError, OrderNotPayableError } from "../../../domain/errors/order-errors.js";
import { OrderGuardReader } from "../../../domain/ports/order-guard.reader.js";
import { OrderReader, type OwnedOrder } from "../../../domain/ports/order.reader.js";
import { GetOrderPaymentHandler } from "../get-order-payment.handler.js";
import { GetOrderPaymentQuery } from "../get-order-payment.query.js";

/** Une commande réduite à ce que ce handler lit. */
function owned(over: {
  readonly paymentStatus: PaymentStatus;
  readonly stripePaymentIntentId?: string | null;
  readonly placedByUserId?: string;
}): OwnedOrder {
  const view = {
    id: "order_1",
    paymentStatus: over.paymentStatus,
    totalCents: 12_345,
  } as unknown as OrderView;
  return {
    view,
    companyId: null,
    placedByUserId: over.placedByUserId ?? "u1",
    stripePaymentIntentId:
      over.stripePaymentIntentId === undefined ? "pi_1" : over.stripePaymentIntentId,
  };
}

function reader(order: OwnedOrder | null): OrderReader {
  return {
    listForProduction: () => Promise.resolve([]),
    listByCompany: () => Promise.resolve([]),
    listPersonal: () => Promise.resolve([]),
    findById: () => Promise.resolve(order),
    listForAdmin: () => Promise.resolve([]),
    findByHandoverToken: () => Promise.resolve(null),
  };
}

const guard: OrderGuardReader = {
  roleOf: () => Promise.resolve(null),
  companyStatusOf: () => Promise.resolve(null),
  settlesOnAccount: () => Promise.resolve(false),
};

function payments(sink: { retrieved: string | null } = { retrieved: null }): PaymentGateway {
  return {
    createIntent: () => Promise.resolve({ paymentIntentId: "pi_1", clientSecret: "pi_1_secret" }),
    retrieveIntent: (id) => {
      sink.retrieved = id;
      return Promise.resolve({ paymentIntentId: id, clientSecret: `${id}_secret` });
    },
    publishableKey: () => "pk_test_123",
    parseWebhook: () => ({ kind: "ignored" }),
  };
}

describe("GetOrderPaymentHandler", () => {
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
    expect(sink.retrieved).toBe("pi_1");
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
});
