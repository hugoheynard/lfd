import type { CardPaymentLine } from "../../../../../card-payment/channels/requests/index.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { OrderAccessReader } from "../../../domain/ports/order-access.reader.js";
import { OrderCardAdoption } from "../../../domain/ports/order-card-payments.js";
import type { OrderReader, OwnedOrder } from "../../../domain/ports/order.reader.js";
import { AT_PLACEMENT } from "../../../domain/services/order-sheet.js";
import { orderView } from "../../handlers/__tests__/payment-failure-doubles.js";
import { AdoptOrderPaymentCommand } from "../adopt-order-payment.command.js";
import { AdoptOrderPaymentHandler } from "../adopt-order-payment.handler.js";

function owned(placedByUserId = "u1"): OwnedOrder {
  return {
    view: orderView("placed", "pending"),
    companyId: null,
    placedByUserId,
    stripePaymentIntentId: "pi_1",
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

class NoCompanyAccess extends OrderAccessReader {
  accessToOrder(): Promise<null> {
    return Promise.resolve(null);
  }
}

class RecordingAdoption extends OrderCardAdoption {
  readonly adopted: string[] = [];

  ensureFirst(orderId: string): Promise<CardPaymentLine | null> {
    this.adopted.push(orderId);
    return Promise.resolve(null);
  }
}

function build(order: OwnedOrder | null) {
  const adoption = new RecordingAdoption();
  const handler = new AdoptOrderPaymentHandler(
    new NoCompanyAccess(),
    reader(order),
    adoption,
    new DirectUnitOfWork(),
  );
  return { adoption, handler };
}

/** Adopter une intention ouverte avant le bloc `card-payment` (plan M2, §4.6 ; lot P0.c2). */
describe("AdoptOrderPaymentHandler", () => {
  it("adopte le premier paiement de la commande que le client peut voir", async () => {
    const { adoption, handler } = build(owned());

    await handler.execute(new AdoptOrderPaymentCommand("u1", "order_1"));

    expect(adoption.adopted).toEqual(["order_1"]);
  });

  it("mure : la commande d'un autre client est introuvable, rien n'est adopté", async () => {
    const { adoption, handler } = build(owned("someone_else"));

    await expect(
      handler.execute(new AdoptOrderPaymentCommand("u1", "order_1")),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
    expect(adoption.adopted).toEqual([]);
  });

  it("404 quand la commande n'existe pas", async () => {
    const { handler } = build(null);

    await expect(
      handler.execute(new AdoptOrderPaymentCommand("u1", "order_1")),
    ).rejects.toBeInstanceOf(OrderNotFoundError);
  });
});
