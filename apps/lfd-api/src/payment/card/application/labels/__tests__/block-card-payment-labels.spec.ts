import { DeclaredCardAccountDefaults } from "../../../../../platform/config/card-accounts.js";
import { HeldAfterCommit } from "../../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedWallClock } from "../../../../../platform/time/fixed-wall-clock.js";
import { CardPayment } from "../../../domain/entities/card-payment.js";
import { relabelDelayMs } from "../../../domain/entities/intent-relabel.js";
import { InvalidCardPaymentLabelError } from "../../../domain/errors/card-payment-errors.js";
import { PaymentAccount } from "../../../domain/value-objects/payment-account.js";
import { PaymentSubject } from "../../../domain/value-objects/payment-subject.js";
import { CardAccountChoice } from "../../card-account-choice.js";
import { SweepIntentRelabelsHandler } from "../../commands/sweep-intent-relabels.handler.js";
import {
  InMemoryCardPayments,
  RecordingCardProvider,
  StaticCardProviders,
} from "../../__tests__/card-payment-doubles.js";
import { BlockCardPaymentLabels } from "../block-card-payment-labels.js";
import { IntentRelabelPoster } from "../intent-relabel-poster.js";
import { InMemoryIntentRelabelQueue, InMemoryIntentRelabels } from "./intent-relabel-doubles.js";

/** L'instant des horloges doublées — rien ne le compare à l'heure réelle. */
const NOW = new Date(Date.UTC(2030, 0, 10, 9));

const ORDER = { type: "order", id: "ord_1" };

const LABEL = {
  description: "LFD · La Folie Coffee pro · Commande n° 2030-00042 · paiement",
  metadata: { app: "la-folie-coffee", order_number: "2030-00042", subject_id: "ord_1" },
};

function harness() {
  const payments = new InMemoryCardPayments();
  payments.seed(
    CardPayment.attach({
      id: "pay_1",
      subject: PaymentSubject.of("order", "ord_1"),
      account: PaymentAccount.of("lfc-stripe"),
      providerRef: "pi_1",
      role: "first",
      amountCents: 2_340,
      at: NOW,
    }),
  );
  const provider = new RecordingCardProvider();
  const providers = new StaticCardProviders(new Map([["lfc-stripe", provider]]));
  const relabels = new InMemoryIntentRelabels();
  const clock = new FixedClock(NOW);
  const wall = new FixedWallClock(NOW);
  const poster = new IntentRelabelPoster(relabels, payments, providers, wall);
  const afterCommit = new HeldAfterCommit();
  const work = new BackgroundWork();
  const labels = new BlockCardPaymentLabels(
    new CardAccountChoice(new DeclaredCardAccountDefaults({ order: "lfc-stripe" }), providers),
    payments,
    relabels,
    poster,
    afterCommit,
    work,
    clock,
  );
  const sweep = new SweepIntentRelabelsHandler(
    new InMemoryIntentRelabelQueue(relabels),
    poster,
    wall,
  );
  /** La transaction de l'appelant valide : l'envoi d'après validation part, et finit. */
  async function commit(): Promise<void> {
    await afterCommit.commit();
    await work.whenIdle();
  }
  return { provider, relabels, labels, afterCommit, commit, sweep, wall, poster };
}

describe("BlockCardPaymentLabels — le libellé gardé dans la transaction de l'appelant", () => {
  it("garde le libellé et ne parle au prestataire qu'APRÈS validation", async () => {
    const { provider, relabels, labels, commit } = harness();

    await labels.describe(ORDER, "pi_1", LABEL);

    expect(relabels.state("pay_1")).toBe("pending");
    expect(provider.descriptions).toEqual([]);

    await commit();

    expect(provider.descriptions).toEqual([{ providerRef: "pi_1", label: LABEL }]);
    expect(relabels.state("pay_1")).toBe("posted");
  });

  it("une transaction annulée n'appelle rien", async () => {
    const { provider, labels, afterCommit } = harness();

    await labels.describe(ORDER, "pi_1", LABEL);
    afterCommit.discard();

    expect(provider.descriptions).toEqual([]);
  });

  it("le même libellé redit (le fait relivré) ne relance rien", async () => {
    const { provider, labels, commit } = harness();
    await labels.describe(ORDER, "pi_1", LABEL);
    await commit();

    await labels.describe(ORDER, "pi_1", LABEL);
    await commit();

    expect(provider.descriptions).toHaveLength(1);
  });

  it("une intention qui n'est pas un paiement de ce sujet n'est pas redite", async () => {
    const { provider, relabels, labels, commit } = harness();

    await labels.describe({ type: "order", id: "ord_2" }, "pi_1", LABEL);
    await labels.describe(ORDER, "pi_inconnue", LABEL);
    await commit();

    expect(relabels.rows.size).toBe(0);
    expect(provider.descriptions).toEqual([]);
  });

  it("refuse une clé réservée au bloc, avant toute écriture", async () => {
    const { relabels, labels } = harness();

    await expect(
      labels.describe(ORDER, "pi_1", { description: "LFD", metadata: { companyId: "x" } }),
    ).rejects.toBeInstanceOf(InvalidCardPaymentLabelError);
    expect(relabels.rows.size).toBe(0);
  });
});

describe("IntentRelabelPoster et le balayage — reprises bornées, paiement intact", () => {
  it("une panne laisse le libellé dû plus tard ; le balayage le pose à l'échéance", async () => {
    const { provider, relabels, labels, commit, sweep, wall } = harness();
    provider.describing = { kind: "unavailable", reason: "api_error: 500" };
    await labels.describe(ORDER, "pi_1", LABEL);
    await commit();
    expect(relabels.state("pay_1")).toBe("pending");

    provider.describing = { kind: "described" };
    await expect(sweep.execute()).resolves.toEqual({ taken: 0, posted: 0, abandoned: 0 });

    wall.advanceMs(relabelDelayMs(1));
    await expect(sweep.execute()).resolves.toEqual({ taken: 1, posted: 1, abandoned: 0 });
    expect(relabels.state("pay_1")).toBe("posted");
  });

  it("un refus du prestataire abandonne, et le paiement n'est pas touché", async () => {
    const { provider, relabels, labels, commit } = harness();
    provider.describing = {
      kind: "refused",
      reason: "invalid_request_error: No such payment_intent",
    };

    await labels.describe(ORDER, "pi_1", LABEL);
    await commit();

    expect(relabels.state("pay_1")).toBe("abandoned");
    expect(provider.calls.filter((call) => !call.startsWith("describeIntent"))).toEqual([]);
  });

  it("un libellé remplacé pendant l'appel n'est pas conclu par l'essai périmé", async () => {
    const { provider, relabels, labels, poster } = harness();
    await labels.describe(ORDER, "pi_1", LABEL);
    const newer = { ...LABEL, description: `${LABEL.description} (corrigé)` };
    provider.describeIntent = async (providerRef, label) => {
      provider.descriptions.push({ providerRef, label });
      await labels.describe(ORDER, "pi_1", newer);
      return { kind: "described" };
    };

    await expect(poster.post("pay_1")).resolves.toBe("skipped");
    expect(relabels.state("pay_1")).toBe("pending");
    expect((await relabels.load("pay_1"))?.label().description).toBe(newer.description);
  });
});
