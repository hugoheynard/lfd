import { NoSubjectSettlementError } from "../../../domain/errors/card-payment-errors.js";
import type { CardPaymentState } from "../../../domain/value-objects/card-payment-state.js";
import { FAILED, harness, NOW, PAID, payment } from "./record-provider-event-harness.js";

describe("RecordProviderEventHandler — encaissé", () => {
  it("appelle le canal AVANT de relire la ligne sous verrou et de l'écrire, puis publie", async () => {
    const { timeline, repo, receive } = harness();
    repo.seed(payment("pending"));

    await receive(PAID);

    expect(timeline.steps).toEqual([
      "channel.onPaid:ord_1:pay_known:2340",
      "repo.load:pay_known",
      "repo.save:pay_known:paid",
      "fact:card_payment.settled",
    ]);
    expect(repo.state("pay_known")).toBe("paid");
  });

  it.each([
    ["applied", "pending"],
    ["refused", "closed"],
    ["already_applied", "pending"],
  ] as const)("porte l'issue du canal « %s » dans le fait", async (outcome, from) => {
    const { repo, settlement, durable, receive } = harness();
    repo.seed(payment(from));
    settlement.paidOutcome = outcome;

    await receive(PAID);

    expect(repo.state("pay_known")).toBe("paid");
    expect(durable.facts).toEqual([
      {
        type: "card_payment.settled",
        key: "card_payment.settled:pay_known",
        payload: {
          paymentId: "pay_known",
          account: "lfc-stripe",
          providerRef: "pi_1",
          subjectType: "order",
          subjectId: "ord_1",
          role: "first",
          amountCents: 2_340,
          outcome,
          paidAt: NOW.toISOString(),
        },
      },
    ]);
  });

  it("ignore un encaissement rejoué : ni canal, ni écriture, ni fait", async () => {
    const { timeline, repo, durable, receive } = harness();
    repo.seed(payment("paid"));

    await receive(PAID);

    expect(timeline.steps).toEqual([]);
    expect(durable.facts).toEqual([]);
  });

  it("refuse un type de sujet sans implémenteur (500) : le prestataire rejouera", async () => {
    const { repo, receive } = harness({ settlementType: "revision_proposal" });
    repo.seed(payment("pending"));

    await expect(receive(PAID)).rejects.toBeInstanceOf(NoSubjectSettlementError);
  });
});

describe("RecordProviderEventHandler — refusé", () => {
  it("canal d'abord, puis la ligne `failed`, puis le fait", async () => {
    const { timeline, repo, durable, receive } = harness();
    repo.seed(payment("pending"));

    await receive(FAILED);

    expect(timeline.steps).toEqual([
      "channel.onPaymentFailed:ord_1:pay_known",
      "repo.load:pay_known",
      "repo.save:pay_known:failed",
      "fact:card_payment.failed",
    ]);
    expect(durable.facts[0]?.key).toBe("card_payment.failed:pay_known");
  });

  it.each<CardPaymentState>(["paid", "closed", "failed"])(
    "ignore un refus périmé sur un paiement %s",
    async (state) => {
      const { timeline, repo, durable, receive } = harness();
      repo.seed(payment(state));

      await receive(FAILED);

      expect(timeline.steps).toEqual([]);
      expect(durable.facts).toEqual([]);
      expect(repo.state("pay_known")).toBe(state);
    },
  );
});

describe("RecordProviderEventHandler — une référence inconnue (§4.6)", () => {
  it("la fait revendiquer, crée la ligne à l'état déclaré, puis applique", async () => {
    const { timeline, repo, settlement, receive } = harness();
    settlement.claims.set("pi_1", {
      subject: { type: "order", id: "ord_old" },
      amountCents: 1_500,
      role: "first",
      settled: "pending",
    });

    await receive(PAID);

    expect(timeline.steps).toEqual([
      "channel.claim:lfc-stripe:pi_1",
      "repo.add:pay_000001:pending",
      "channel.onPaid:ord_old:pay_000001:1500",
      "repo.load:pay_000001",
      "repo.save:pay_000001:paid",
      "fact:card_payment.settled",
    ]);
    expect(repo.state("pay_000001")).toBe("paid");
  });

  it("revendiquée déjà payée (l'ancienne image a fait `markPaid`) : la ligne naît `paid`, rien d'autre", async () => {
    const { timeline, repo, settlement, durable, receive } = harness();
    settlement.claims.set("pi_1", {
      subject: { type: "order", id: "ord_old" },
      amountCents: 1_500,
      role: "first",
      settled: "paid",
    });

    await receive(PAID);

    expect(timeline.steps).toEqual(["channel.claim:lfc-stripe:pi_1", "repo.add:pay_000001:paid"]);
    expect(repo.state("pay_000001")).toBe("paid");
    expect(durable.facts).toEqual([]);
  });

  it("non revendiquée : un fait `unmatched` avec le type d'événement", async () => {
    const { repo, durable, receive } = harness();

    await receive(PAID);

    expect(repo.rows.size).toBe(0);
    expect(durable.facts).toEqual([
      {
        type: "card_payment.unmatched",
        key: "card_payment.unmatched:lfc-stripe:evt_paid",
        payload: {
          account: "lfc-stripe",
          eventId: "evt_paid",
          eventType: "payment_intent.succeeded",
          providerRef: "pi_1",
          refund: null,
        },
      },
    ]);
  });
});
