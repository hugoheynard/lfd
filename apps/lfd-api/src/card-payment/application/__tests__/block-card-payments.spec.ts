import { DeclaredCardAccountDefaults } from "../../../platform/config/card-accounts.js";
import { DirectUnitOfWork } from "../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../platform/time/fixed-clock.js";
import { CardPayment } from "../../domain/entities/card-payment.js";
import {
  CardPaymentNotFoundError,
  NoCardAccountForSubjectTypeError,
} from "../../domain/errors/card-payment-errors.js";
import type { CardPaymentState } from "../../domain/value-objects/card-payment-state.js";
import { PaymentAccount } from "../../domain/value-objects/payment-account.js";
import { PaymentSubject } from "../../domain/value-objects/payment-subject.js";
import { BlockCardPayments } from "../block-card-payments.js";
import { CardAccountChoice } from "../card-account-choice.js";
import {
  InMemoryCardPayments,
  RecordingCardProvider,
  StaticCardProviders,
} from "./card-payment-doubles.js";

/** L'instant de l'horloge doublée — rien ne le compare à l'heure réelle. */
const NOW = new Date("2030-01-10T09:00:00.000Z");

function harness() {
  const repo = new InMemoryCardPayments();
  const provider = new RecordingCardProvider("pk_live_x");
  const providers = new StaticCardProviders(new Map([["lfc-stripe", provider]]));
  const payments = new BlockCardPayments(
    new CardAccountChoice(new DeclaredCardAccountDefaults({ order: "lfc-stripe" }), providers),
    providers,
    repo,
    new FixedIdGenerator("pay"),
    new FixedClock(NOW),
    new DirectUnitOfWork(),
  );
  return { repo, provider, payments };
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

describe("BlockCardPayments.prepare puis attach", () => {
  it("crée l'intention sur le compte du type de sujet, puis rattache une ligne `pending`", async () => {
    const { repo, provider, payments } = harness();

    const preparation = await payments.prepare("order", 2_340, "cmp_1");
    const attached = await payments.attach(
      { type: "order", id: "ord_1" },
      preparation.prepared,
      "first",
    );

    expect(provider.calls).toEqual(["createIntent:2340:eur:cmp_1"]);
    expect(preparation).toEqual({
      prepared: { account: "lfc-stripe", providerRef: "pi_new", amountCents: 2_340 },
      clientSecret: "pi_new_secret",
      publishableKey: "pk_live_x",
    });
    expect(attached).toEqual({ paymentId: "pay_000001", providerRef: "pi_new" });
    expect(repo.rows.get("pay_000001")?.toPersistence()).toMatchObject({
      subjectType: "order",
      subjectId: "ord_1",
      account: "lfc-stripe",
      state: "pending",
      createdAt: NOW,
    });
  });

  it("refuse un type de sujet sans compte, avant tout appel au prestataire", async () => {
    const { provider, payments } = harness();

    await expect(payments.prepare("gift_card", 500, "personal")).rejects.toBeInstanceOf(
      NoCardAccountForSubjectTypeError,
    );
    expect(provider.calls).toEqual([]);
  });
});

describe("BlockCardPayments.release", () => {
  it("annule l'intention orpheline, sans lever même si le prestataire refuse", async () => {
    const { provider, payments } = harness();
    provider.cancellation = { kind: "unavailable", reason: "réseau" };

    await expect(
      payments.release({ account: "lfc-stripe", providerRef: "pi_x", amountCents: 100 }),
    ).resolves.toBeUndefined();
    expect(provider.calls).toEqual(["cancelIntent:pi_x"]);
  });

  it("ne lève pas pour un compte inconnu", async () => {
    const { payments } = harness();

    await expect(
      payments.release({ account: "lfc-autre", providerRef: "pi_x", amountCents: 100 }),
    ).resolves.toBeUndefined();
  });
});

describe("BlockCardPayments.retrieve", () => {
  it("relit sur le compte de la ligne", async () => {
    const { repo, provider, payments } = harness();
    seeded(repo, "pending");

    await expect(payments.retrieve("pay_1")).resolves.toEqual({
      paymentId: "pay_1",
      providerRef: "pi_1",
      clientSecret: "pi_1_secret",
      publishableKey: "pk_live_x",
      state: "awaiting_payment",
    });
    expect(provider.calls).toEqual(["retrieveIntent:pi_1"]);
  });

  it("refuse un paiement inconnu (404)", async () => {
    const { payments } = harness();

    await expect(payments.retrieve("pay_x")).rejects.toBeInstanceOf(CardPaymentNotFoundError);
  });
});

describe("BlockCardPayments.cancel", () => {
  it.each(["cancelled", "already_cancelled"] as const)(
    "« %s » chez le prestataire : la ligne se ferme",
    async (kind) => {
      const { repo, provider, payments } = harness();
      seeded(repo, "failed");
      provider.cancellation = { kind };

      await expect(payments.cancel("pay_1")).resolves.toEqual({ kind });
      expect(repo.state("pay_1")).toBe("closed");
    },
  );

  it.each(["already_paid", "in_progress"] as const)(
    "« %s » : la ligne ne bouge pas, le webhook réconciliera",
    async (kind) => {
      const { repo, provider, payments } = harness();
      seeded(repo, "pending");
      provider.cancellation = { kind };

      await payments.cancel("pay_1");

      expect(repo.state("pay_1")).toBe("pending");
    },
  );

  it("un encaissement arrivé entre l'appel et la fermeture n'est pas défait", async () => {
    const { repo, provider, payments } = harness();
    seeded(repo, "paid");
    provider.cancellation = { kind: "already_cancelled" };

    await payments.cancel("pay_1");

    expect(repo.state("pay_1")).toBe("paid");
  });
});

describe("BlockCardPayments.adopt", () => {
  it("adopte une intention de l'ancienne image à l'état déclaré", async () => {
    const { repo, payments } = harness();

    const id = await payments.adopt({ type: "order", id: "ord_9" }, "pi_9", 990, "first", "failed");

    expect(id).toBe("pay_000001");
    expect(repo.state(id)).toBe("failed");
  });

  it("est idempotent : une référence déjà rattachée rend sa ligne", async () => {
    const { repo, payments } = harness();
    seeded(repo, "pending");

    await expect(
      payments.adopt({ type: "order", id: "ord_1" }, "pi_1", 2_340, "first", "paid"),
    ).resolves.toBe("pay_1");
    expect(repo.state("pay_1")).toBe("pending");
    expect(repo.rows.size).toBe(1);
  });
});
