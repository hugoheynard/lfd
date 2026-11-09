/** Le banc commun des specs du webhook des cartes (`RecordProviderEventHandler`). */
import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { RegisteredSubjectSettlements } from "../../../channels/subjects/index.js";
import { CardPayment } from "../../../domain/entities/card-payment.js";
import type { CardProviderEvent } from "../../../domain/ports/card-provider-event.js";
import type { CardPaymentState } from "../../../domain/value-objects/card-payment-state.js";
import { PaymentAccount } from "../../../domain/value-objects/payment-account.js";
import { PaymentSubject } from "../../../domain/value-objects/payment-subject.js";
import {
  InMemoryCardPayments,
  RecordingCardProvider,
  RecordingDurable,
  StaticCardProviders,
  TestSubjectSettlement,
  Timeline,
} from "../../__tests__/card-payment-doubles.js";
import { IntentOutcomeRecorder } from "../../intent-outcome-recorder.js";
import { ProviderPaymentResolver } from "../../provider-payment-resolver.js";
import { RecordProviderEventCommand } from "../record-provider-event.command.js";
import { RecordProviderEventHandler } from "../record-provider-event.handler.js";

/** L'instant de l'horloge doublée — rien ne le compare à l'heure réelle. */
export const NOW = new Date("2030-01-10T09:00:00.000Z");
const BODY = Buffer.from("{}");

export function harness(options: { readonly settlementType?: string } = {}) {
  const timeline = new Timeline();
  const repo = new InMemoryCardPayments(timeline);
  const provider = new RecordingCardProvider();
  const providers = new StaticCardProviders(new Map([["lfc-stripe", provider]]), [
    "lfc-stripe",
    "lfc-sans-secrets",
  ]);
  const settlement = new TestSubjectSettlement(timeline, options.settlementType ?? "order");
  const settlements = new RegisteredSubjectSettlements([settlement]);
  const durable = new RecordingDurable(timeline);
  const clock = new FixedClock(NOW);
  const handler = new RecordProviderEventHandler(
    providers,
    new ProviderPaymentResolver(repo, settlements, new FixedIdGenerator("pay"), clock),
    new IntentOutcomeRecorder(repo, settlements, durable, clock),
    durable,
    new DirectUnitOfWork(),
  );
  const receive = (event: CardProviderEvent, account = "lfc-stripe") => {
    provider.event = event;
    return handler.execute(new RecordProviderEventCommand(account, BODY, "sig"));
  };
  return { timeline, repo, provider, settlement, durable, receive };
}

/** Un paiement de la commande `ord_1`, sur `pi_1`, dans l'état voulu. */
export function payment(state: CardPaymentState): CardPayment {
  return CardPayment.adopt(
    {
      id: "pay_known",
      subject: PaymentSubject.of("order", "ord_1"),
      account: PaymentAccount.of("lfc-stripe"),
      providerRef: "pi_1",
      role: "first",
      amountCents: 2_340,
      at: NOW,
    },
    state,
  );
}

export const PAID: CardProviderEvent = {
  kind: "paid",
  eventId: "evt_paid",
  eventType: "payment_intent.succeeded",
  providerRef: "pi_1",
};
export const FAILED: CardProviderEvent = {
  kind: "payment_failed",
  eventId: "evt_failed",
  eventType: "payment_intent.payment_failed",
  providerRef: "pi_1",
};
export const REFUND: CardProviderEvent = {
  kind: "refund",
  eventId: "evt_refund",
  eventType: "refund.updated",
  providerRef: "pi_1",
  refundId: "re_1",
  amountCents: 1_000,
  currency: "eur",
  status: "succeeded",
  createdAt: NOW,
};
