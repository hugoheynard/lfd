import { CommandBus } from "@nestjs/cqrs";
import { Test } from "@nestjs/testing";

import { InvalidWebhookSignatureError } from "../../../domain/errors/payment-errors.js";
import { CheckoutGateway } from "../../../domain/ports/checkout-gateway.js";
import { ExpirePaymentLinkCommand } from "../expire-payment-link.command.js";
import { RecordPaymentLinkEventCommand } from "../record-payment-link-event.command.js";
import { RecordPaymentLinkEventHandler } from "../record-payment-link-event.handler.js";
import { SettlePaymentLinkCommand } from "../settle-payment-link.command.js";
import { RecordingCheckout } from "./payment-link-doubles.js";

async function build() {
  const checkout = new RecordingCheckout();
  const sent: unknown[] = [];
  const module = await Test.createTestingModule({
    providers: [
      RecordPaymentLinkEventHandler,
      { provide: CheckoutGateway, useValue: checkout },
      {
        provide: CommandBus,
        useValue: {
          execute: (command: unknown) => {
            sent.push(command);
            return Promise.resolve();
          },
        },
      },
    ],
  }).compile();
  const handler = module.get(RecordPaymentLinkEventHandler);
  const receive = (signature = "sig") =>
    handler.execute(new RecordPaymentLinkEventCommand(Buffer.from("{}"), signature));
  return { checkout, sent, receive };
}

/** Le webhook propre des liens de paiement (plan M2, §4.5 ; lot P0.c2). */
describe("RecordPaymentLinkEventHandler", () => {
  it("une page encaissée solde le lien", async () => {
    const { checkout, sent, receive } = await build();
    checkout.linkEvent = { kind: "paid", sessionId: "cs_1" };

    await receive();

    expect(sent).toEqual([new SettlePaymentLinkCommand("cs_1")]);
  });

  it("une page morte expire le lien", async () => {
    const { checkout, sent, receive } = await build();
    checkout.linkEvent = { kind: "expired", sessionId: "cs_1" };

    await receive();

    expect(sent).toEqual([new ExpirePaymentLinkCommand("cs_1")]);
  });

  it("un événement ignoré ne projette rien", async () => {
    const { sent, receive } = await build();

    await receive();

    expect(sent).toEqual([]);
  });

  it("une signature refusée ne projette rien, et remonte (400)", async () => {
    const { sent, receive } = await build();

    await expect(receive("bad")).rejects.toBeInstanceOf(InvalidWebhookSignatureError);
    expect(sent).toEqual([]);
  });
});
