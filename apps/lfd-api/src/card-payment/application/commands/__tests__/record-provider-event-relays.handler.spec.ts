import {
  CardAccountUnavailableError,
  InvalidProviderSignatureError,
  UnknownCardAccountError,
} from "../../../domain/errors/card-payment-errors.js";
import { harness, NOW, PAID, payment, REFUND } from "./record-provider-event-harness.js";

describe("RecordProviderEventHandler — relais", () => {
  /**
   * Depuis P1 (plan M2, §3.3, v11) : plus de relais `provider_refund_event`
   * vers `orders` — le bloc constate lui-même, et le sujet reçoit l'issue au
   * canal. Le détail du constat est éprouvé par `card-refund-observation.spec.ts`.
   */
  it("un remboursement d'un paiement connu est CONSTATÉ par le bloc — plus de `provider_refund_event`", async () => {
    const { repo, durable, settlement, store, receive } = harness();
    repo.seed(payment("paid"));

    await receive(REFUND);

    expect(durable.types()).toEqual(["card_payment.refund_succeeded"]);
    expect(store.linesOf("pay_known")).toMatchObject([
      { providerRef: "re_1", amountCents: 1_000, status: "succeeded", source: "provider" },
    ]);
    expect(settlement.refundOutcomes.map((outcome) => outcome.kind)).toEqual(["succeeded"]);
  });

  it("un remboursement hors de nos sujets part en `unmatched`, remboursement joint, et au journal", async () => {
    const { durable, journal, receive } = harness();

    await receive(REFUND);

    expect(durable.types()).toEqual(["card_payment.unmatched"]);
    expect(journal.facts).toEqual([
      {
        type: "card_payment.unmatched",
        subjectType: "card_payment",
        subjectId: "lfc-stripe:evt_refund",
        payload: { account: "lfc-stripe", eventType: "refund.updated" },
      },
    ]);
    expect(durable.facts[0]?.payload["refund"]).toEqual({
      refundId: "re_1",
      amountCents: 1_000,
      currency: "eur",
      status: "succeeded",
      refundedAt: NOW.toISOString(),
    });
  });

  it("la page d'un lien de paiement part en `checkout_event`", async () => {
    const { durable, receive } = harness();

    await receive({
      kind: "checkout",
      eventId: "evt_cs",
      eventType: "checkout.session.completed",
      outcome: "paid",
      sessionId: "cs_1",
    });

    expect(durable.facts).toEqual([
      {
        type: "card_payment.checkout_event",
        key: "card_payment.checkout_event:lfc-stripe:evt_cs",
        payload: {
          account: "lfc-stripe",
          eventId: "evt_cs",
          eventType: "checkout.session.completed",
          outcome: "paid",
          sessionId: "cs_1",
        },
      },
    ]);
  });

  it("tout autre type part en `unmatched`, jamais en 200 muet", async () => {
    const { durable, receive } = harness();

    await receive({ kind: "other", eventId: "evt_x", eventType: "charge.refunded" });

    expect(durable.facts[0]).toMatchObject({
      type: "card_payment.unmatched",
      payload: { eventType: "charge.refunded", providerRef: null, refund: null },
    });
  });
});

describe("RecordProviderEventHandler — refus d'entrée", () => {
  it.each(["lfc-inconnu", "../etc", ""])(
    "refuse le compte %p (400) sans lire le corps",
    async (account) => {
      const { provider, durable, receive } = harness();

      await expect(receive(PAID, account)).rejects.toBeInstanceOf(UnknownCardAccountError);
      expect(provider.calls).toEqual([]);
      expect(durable.facts).toEqual([]);
    },
  );

  it("un compte du registre sans secrets : erreur technique, le prestataire rejouera", async () => {
    const { receive } = harness();

    await expect(receive(PAID, "lfc-sans-secrets")).rejects.toBeInstanceOf(
      CardAccountUnavailableError,
    );
  });

  it("une signature refusée : rien n'est traité", async () => {
    const { provider, durable, timeline, receive } = harness();
    provider.signatureRefused = new InvalidProviderSignatureError();

    await expect(receive(PAID)).rejects.toBeInstanceOf(InvalidProviderSignatureError);
    expect(durable.facts).toEqual([]);
    expect(timeline.steps).toEqual([]);
  });
});
