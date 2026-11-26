import { DeclaredCardAccountDefaults } from "../../../../platform/config/card-accounts.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { RegisteredSubjectSettlements } from "../../../channels/subjects/index.js";
import { CardPayment } from "../../domain/entities/card-payment.js";
import {
  CardPaymentNotFoundError,
  CardProviderUnavailableError,
} from "../../domain/errors/card-payment-errors.js";
import type { CardPaymentState } from "../../domain/value-objects/card-payment-state.js";
import { PaymentAccount } from "../../domain/value-objects/payment-account.js";
import { PaymentSubject } from "../../domain/value-objects/payment-subject.js";
import { BlockCardPayments } from "../block-card-payments.js";
import { CardAccountChoice } from "../card-account-choice.js";
import { IntentOutcomeRecorder } from "../intent-outcome-recorder.js";
import {
  InMemoryCardPayments,
  OutsideWorkCardProvider,
  RecordingDurable,
  StaticCardProviders,
  TestSubjectSettlement,
  Timeline,
  TimelineUnitOfWork,
} from "./card-payment-doubles.js";
import { RecordingLinkPaymentNotice } from "./recording-link-payment-notice.js";
import { inMemoryCustomerResolution } from "./card-customer-doubles.js";

/** L'instant de l'horloge doublée — rien ne le compare à l'heure réelle. */
const NOW = new Date("2030-01-10T09:00:00.000Z");

function harness() {
  const timeline = new Timeline();
  const repo = new InMemoryCardPayments(timeline);
  const uow = new TimelineUnitOfWork(timeline);
  const provider = new OutsideWorkCardProvider(uow);
  const settlement = new TestSubjectSettlement(timeline);
  const providers = new StaticCardProviders(new Map([["lfc-stripe", provider]]));
  const customers = inMemoryCustomerResolution(new FixedClock(NOW));
  const payments = new BlockCardPayments(
    new CardAccountChoice(new DeclaredCardAccountDefaults({ order: "lfc-stripe" }), providers),
    providers,
    repo,
    new FixedIdGenerator("pay"),
    new FixedClock(NOW),
    uow,
    new IntentOutcomeRecorder(
      repo,
      new RegisteredSubjectSettlements([settlement]),
      new RecordingDurable(timeline),
      new FixedClock(NOW),
      new RecordingLinkPaymentNotice(timeline),
    ),
    customers.resolution,
  );
  return { repo, provider, payments, timeline, settlement };
}

function seeded(repo: InMemoryCardPayments, state: CardPaymentState): void {
  repo.seed(
    CardPayment.adopt(
      {
        id: "pay_1",
        subject: PaymentSubject.of("order", "ord_1"),
        account: PaymentAccount.of("lfc-stripe"),
        providerRef: "pi_1",
        role: "first",
        amountCents: 2_340,
        at: NOW,
      },
      state,
    ),
  );
}

/** Plan S2, §2.7, et plan B, §2.3 : le webhook perdu rattrapé. */
describe("BlockCardPayments.settleFromProvider", () => {
  it("encaissée chez le prestataire : rejoue le chemin du webhook, le sujet avec le rôle de la ligne", async () => {
    const { repo, provider, payments, timeline } = harness();
    seeded(repo, "pending");
    provider.intentState = "succeeded";

    await expect(payments.settleFromProvider("pay_1")).resolves.toBe("settled");

    expect(provider.calls).toEqual(["retrieveIntent:pi_1"]);
    expect(timeline.steps).toContain("channel.onPaid:ord_1:pay_1:2340:first");
    expect(repo.rows.get("pay_1")?.state).toBe("paid");
  });

  /**
   * Régression : la ligne était verrouillée avant le sujet, à l'inverse du
   * webhook — deux transactions sur la même commande pouvaient s'interbloquer.
   */
  it("l'ordre des verrous est celui du webhook : le sujet d'abord, la ligne ensuite", async () => {
    const { repo, provider, payments, timeline } = harness();
    seeded(repo, "pending");
    provider.intentState = "succeeded";

    await payments.settleFromProvider("pay_1");

    const inside = timeline.steps.slice(
      timeline.steps.indexOf("uow.begin"),
      timeline.steps.indexOf("uow.end"),
    );
    expect(inside.slice(0, 3)).toEqual([
      "uow.begin",
      "channel.onPaid:ord_1:pay_1:2340:first",
      "repo.load:pay_1",
    ]);
  });

  it("déjà encaissée pour le bloc : `replayed`, rien n'est rejoué", async () => {
    const { repo, provider, payments, timeline } = harness();
    seeded(repo, "paid");
    provider.intentState = "succeeded";

    await expect(payments.settleFromProvider("pay_1")).resolves.toBe("replayed");

    expect(timeline.steps.some((step) => step.startsWith("channel.onPaid"))).toBe(false);
  });

  it("encaissée mais refusée par le sujet : `refused_by_subject`, la ligne passe payée", async () => {
    const { repo, provider, payments, settlement } = harness();
    seeded(repo, "pending");
    provider.intentState = "succeeded";
    settlement.paidOutcome = "refused";

    await expect(payments.settleFromProvider("pay_1")).resolves.toBe("refused_by_subject");

    expect(repo.rows.get("pay_1")?.state).toBe("paid");
  });

  it("le sujet se savait déjà réglé : la ligne rattrape, `settled`", async () => {
    const { repo, provider, payments, settlement } = harness();
    seeded(repo, "failed");
    provider.intentState = "succeeded";
    settlement.paidOutcome = "already_applied";

    await expect(payments.settleFromProvider("pay_1")).resolves.toBe("settled");

    expect(repo.rows.get("pay_1")?.state).toBe("paid");
  });

  it("le prestataire est relu AVANT l'unité de travail", async () => {
    const { repo, provider, payments, timeline } = harness();
    seeded(repo, "pending");
    provider.intentState = "succeeded";

    await payments.settleFromProvider("pay_1");

    expect(timeline.steps).toContain("uow.begin");
    expect(provider.insideWork).toEqual([]);
  });

  it.each(["awaiting_payment", "processing"] as const)(
    "« %s » : rien n'est décidé, rien n'est écrit",
    async (state) => {
      const { repo, provider, payments, timeline } = harness();
      seeded(repo, "pending");
      provider.intentState = state;

      await expect(payments.settleFromProvider("pay_1")).resolves.toBe("pending");

      expect(repo.rows.get("pay_1")?.state).toBe("pending");
      expect(timeline.steps).not.toContain("uow.begin");
    },
  );

  it("annulée chez le prestataire : la ligne se ferme", async () => {
    const { repo, provider, payments } = harness();
    seeded(repo, "pending");
    provider.intentState = "canceled";

    await expect(payments.settleFromProvider("pay_1")).resolves.toBe("closed");

    expect(repo.rows.get("pay_1")?.state).toBe("closed");
  });

  it("le prestataire ne répond pas : l'erreur remonte, l'appelant compte l'échec", async () => {
    const { repo, provider, payments } = harness();
    seeded(repo, "pending");
    provider.intentState = null;

    await expect(payments.settleFromProvider("pay_1")).rejects.toBeInstanceOf(
      CardProviderUnavailableError,
    );
    expect(repo.rows.get("pay_1")?.state).toBe("pending");
  });

  it("refuse un paiement inconnu", async () => {
    const { payments } = harness();

    await expect(payments.settleFromProvider("pay_x")).rejects.toBeInstanceOf(
      CardPaymentNotFoundError,
    );
  });
});
