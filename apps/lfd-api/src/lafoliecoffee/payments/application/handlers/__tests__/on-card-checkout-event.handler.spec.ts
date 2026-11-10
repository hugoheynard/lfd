import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import {
  CardPaymentCheckoutEvent,
  type CheckoutOutcome,
} from "../../../../../card-payment/channels/facts/index.js";
import { PaymentGatewayUnavailableError } from "../../../domain/errors/payment-errors.js";
import { ExpirePaymentLinkCommand } from "../../commands/expire-payment-link.command.js";
import { SettlePaymentLinkCommand } from "../../commands/settle-payment-link.command.js";
import { OnCardCheckoutEvent } from "../on-card-checkout-event.handler.js";

async function subject(failure: Error | null = null) {
  const sent: unknown[] = [];
  const module = await Test.createTestingModule({
    providers: [
      OnCardCheckoutEvent,
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
  return { sent, handler: module.get(OnCardCheckoutEvent) };
}

function deliveryOf(outcome: CheckoutOutcome) {
  const fact = new CardPaymentCheckoutEvent(
    "lfc-stripe",
    "evt_1",
    "checkout.session.completed",
    outcome,
    "cs_1",
  ).durableFact();
  return { eventId: "out_1", type: fact.type, payload: fact.payload };
}

/** Le relais des pages de lien par le webhook des cartes (plan M2, §4.5 ; lot P0.c2). */
describe("OnCardCheckoutEvent", () => {
  it.each([
    ["paid", new SettlePaymentLinkCommand("cs_1")],
    ["expired", new ExpirePaymentLinkCommand("cs_1")],
  ] as const)("%s → la commande idempotente qui le projette", async (outcome, expected) => {
    const { sent, handler } = await subject();

    await handler.handle(deliveryOf(outcome));

    expect(sent).toEqual([expected]);
  });

  it("laisse lever une panne technique : la boîte d'envoi rejouera", async () => {
    const { handler } = await subject(new PaymentGatewayUnavailableError("réseau"));

    await expect(handler.handle(deliveryOf("paid"))).rejects.toBeInstanceOf(
      PaymentGatewayUnavailableError,
    );
  });
});
