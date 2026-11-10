import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { CardPaymentProviderRefundEvent } from "../../../../../card-payment/channels/facts/index.js";
import { RefundRejectedError } from "../../../domain/errors/order-refund-errors.js";
import { RecordOrderRefundCommand } from "../../commands/record-order-refund.command.js";
import { OnCardProviderRefundEvent } from "../on-card-provider-refund-event.handler.js";

/** Instant du prestataire, recopié dans la commande — comparé à rien. */
const REFUNDED_AT = new Date(Date.UTC(2030, 0, 10, 9));

async function subject(failure: Error | null = null) {
  const sent: unknown[] = [];
  const module = await Test.createTestingModule({
    providers: [
      OnCardProviderRefundEvent,
      {
        provide: CommandBus,
        useValue: {
          execute: (command: unknown) => {
            sent.push(command);
            return failure === null ? Promise.resolve() : Promise.reject(failure);
          },
        },
      },
    ],
  }).compile();
  return { sent, handler: module.get(OnCardProviderRefundEvent) };
}

function deliveryOf(subjectType = "order") {
  const fact = new CardPaymentProviderRefundEvent(
    "lfc-stripe",
    "evt_1",
    "pay_1",
    "pi_1",
    subjectType,
    "ord_1",
    {
      refundId: "re_1",
      amountCents: 2_340,
      currency: "eur",
      status: "succeeded",
      refundedAt: REFUNDED_AT,
    },
  ).durableFact();
  return { eventId: "out_1", type: fact.type, payload: fact.payload };
}

/** Le relais transitoire du constat d'un remboursement (plan M2, §4.2 ; lot P0.c2). */
describe("OnCardProviderRefundEvent", () => {
  it("constate le remboursement sur la commande, avec la charge du webhook d'avant", async () => {
    const { sent, handler } = await subject();

    await handler.handle(deliveryOf());

    expect(sent).toEqual([
      new RecordOrderRefundCommand("pi_1", {
        stripeRefundId: "re_1",
        amountCents: 2_340,
        currency: "eur",
        status: "succeeded",
        refundedAt: REFUNDED_AT,
      }),
    ]);
  });

  it("ignore le remboursement d'un autre type de sujet", async () => {
    const { sent, handler } = await subject();

    await handler.handle(deliveryOf("invoice"));

    expect(sent).toEqual([]);
  });

  it("absorbe un refus déterministe : le rejouer donnerait le même refus", async () => {
    const { handler } = await subject(new RefundRejectedError("currency"));

    await expect(handler.handle(deliveryOf())).resolves.toBeUndefined();
  });

  it("laisse lever une panne : la boîte d'envoi rejouera", async () => {
    const { handler } = await subject(new Error("connexion perdue"));

    await expect(handler.handle(deliveryOf())).rejects.toThrow("connexion perdue");
  });
});
