import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  RegisteredSubjectSettlements,
  type SubjectReference,
  type SubjectSettledState,
} from "../../../channels/subjects/index.js";
import { CardPayment } from "../../../domain/entities/card-payment.js";
import type { CardPaymentState } from "../../../domain/value-objects/card-payment-state.js";
import { PaymentAccount } from "../../../domain/value-objects/payment-account.js";
import { PaymentSubject } from "../../../domain/value-objects/payment-subject.js";
import {
  InMemoryCardPayments,
  OrderDefaults,
  StaticTakeover,
  TestSubjectSettlement,
  Timeline,
} from "../../__tests__/card-payment-doubles.js";
import type { FirstPaymentsReplayReport } from "../replay-first-payments.command.js";
import { ReplayFirstPaymentsHandler } from "../replay-first-payments.handler.js";

const HOUR_MS = 60 * 60 * 1000;
/** Le témoin et l'horloge sont comparés entre eux seulement, jamais à l'heure réelle. */
const MIGRATED_AT = new Date("2030-01-10T03:00:00.000Z");
const NOW = new Date(MIGRATED_AT.getTime() + 5 * HOUR_MS);
const BEFORE_WITNESS = new Date(MIGRATED_AT.getTime() - 30 * 24 * HOUR_MS);

function harness(migratedAt: Date | null = MIGRATED_AT) {
  const timeline = new Timeline();
  const repo = new InMemoryCardPayments(timeline);
  const settlement = new TestSubjectSettlement(timeline);
  const handler = new ReplayFirstPaymentsHandler(
    new StaticTakeover(migratedAt),
    new RegisteredSubjectSettlements([settlement]),
    new OrderDefaults(),
    repo,
    new FixedIdGenerator("pay"),
    new FixedClock(NOW),
    new DirectUnitOfWork(),
  );
  return { repo, settlement, replay: () => handler.execute() };
}

function reference(
  orderId: string,
  providerRef: string,
  settled: SubjectSettledState,
  amountCents = 2_340,
): SubjectReference {
  return {
    subject: { type: "order", id: orderId },
    providerRef,
    amountCents,
    role: "first",
    settled,
  };
}

function line(
  orderId: string,
  providerRef: string,
  state: CardPaymentState,
  at = NOW,
): CardPayment {
  return CardPayment.adopt(
    {
      id: `pay_${orderId}`,
      subject: PaymentSubject.of("order", orderId),
      account: PaymentAccount.of("lfc-stripe"),
      providerRef,
      role: "first",
      amountCents: 2_340,
      at,
    },
    state,
  );
}

function replayed(report: FirstPaymentsReplayReport) {
  if (report.status !== "replayed") {
    throw new Error(`rattrapage attendu, reçu ${report.status}`);
  }
  return report;
}

describe("ReplayFirstPaymentsHandler", () => {
  it("sans témoin : ne fait rien, et le dit", async () => {
    const { settlement, replay } = harness(null);

    await expect(replay()).resolves.toEqual({ status: "no_takeover" });
    expect(settlement.referencesAskedSince).toBeNull();
  });

  it("demande au sujet ses références depuis le témoin moins une heure", async () => {
    const { settlement, replay } = harness();

    await replay();

    expect(settlement.referencesAskedSince).toEqual(new Date(MIGRATED_AT.getTime() - HOUR_MS));
  });

  it("insère une référence absente, à l'état que le sujet déclare", async () => {
    const { repo, settlement, replay } = harness();
    settlement.references = [reference("ord_new", "pi_new", "failed")];

    const report = replayed(await replay());

    expect(report).toMatchObject({ examined: 1, inserted: 1, diverged: [] });
    const inserted = [...repo.rows.values()][0];
    expect(inserted?.toPersistence()).toMatchObject({
      subjectId: "ord_new",
      providerRef: "pi_new",
      account: "lfc-stripe",
      state: "failed",
    });
  });

  it("avance une ligne en retard (un `markPaid` de l'ancienne image), jamais en arrière", async () => {
    const { repo, settlement, replay } = harness();
    repo.seed(line("ord_1", "pi_1", "pending"));
    repo.seed(line("ord_2", "pi_2", "paid"));
    settlement.references = [
      reference("ord_1", "pi_1", "paid"),
      reference("ord_2", "pi_2", "pending"),
    ];

    const report = replayed(await replay());

    expect(repo.state("pay_ord_1")).toBe("paid");
    expect(repo.rows.get("pay_ord_1")?.paidAt).toEqual(NOW);
    expect(repo.state("pay_ord_2")).toBe("paid");
    expect(report.advanced).toBe(1);
    expect(report.diverged).toEqual([
      {
        subjectType: "order",
        subjectId: "ord_2",
        providerRef: "pi_2",
        line: "paid",
        subject: "pending",
      },
    ]);
  });

  it("une annulée encaissée (ligne `paid`, sujet `closed`) est juste, pas un écart", async () => {
    const { repo, settlement, replay } = harness();
    repo.seed(line("ord_c", "pi_c", "paid"));
    settlement.references = [reference("ord_c", "pi_c", "closed")];
    settlement.cancelled.add("ord_c");

    const report = replayed(await replay());

    expect(report).toMatchObject({ inStep: 1, diverged: [] });
    expect(repo.state("pay_ord_c")).toBe("paid");
  });

  it("la même chose sur un sujet NON annulé est un écart signalé", async () => {
    const { repo, settlement, replay } = harness();
    repo.seed(line("ord_c", "pi_c", "paid"));
    settlement.references = [reference("ord_c", "pi_c", "closed")];

    expect(replayed(await replay()).diverged).toHaveLength(1);
  });

  it("une annulée que le sujet dit `failed` avec une ligne `paid` reste un écart (le sujet dit `closed` pour une annulée)", async () => {
    const { repo, settlement, replay } = harness();
    repo.seed(line("ord_c", "pi_c", "paid"));
    settlement.references = [reference("ord_c", "pi_c", "failed")];
    settlement.cancelled.add("ord_c");

    expect(replayed(await replay()).diverged).toHaveLength(1);
  });

  it("relit par `claim` un vieil impayé d'avant le témoin, et l'avance", async () => {
    const { repo, settlement, replay } = harness();
    repo.seed(line("ord_old", "pi_old", "pending", BEFORE_WITNESS));
    settlement.claims.set("pi_old", {
      subject: { type: "order", id: "ord_old" },
      amountCents: 2_340,
      role: "first",
      settled: "closed",
    });

    const report = replayed(await replay());

    expect(repo.state("pay_ord_old")).toBe("closed");
    expect(report).toMatchObject({ examined: 1, advanced: 1 });
  });

  it("un vieil impayé que plus aucun sujet ne revendique est signalé", async () => {
    const { repo, replay } = harness();
    repo.seed(line("ord_old", "pi_old", "failed", BEFORE_WITNESS));

    const report = replayed(await replay());

    expect(report.diverged).toEqual([
      {
        subjectType: "order",
        subjectId: "ord_old",
        providerRef: "pi_old",
        line: "failed",
        subject: "unclaimed",
      },
    ]);
  });

  it("une référence que le domaine refuse est signalée, et n'arrête pas les suivantes", async () => {
    const { repo, settlement, replay } = harness();
    settlement.references = [
      reference("ord_zero", "pi_zero", "pending", 0),
      reference("ord_ok", "pi_ok", "pending"),
    ];

    const report = replayed(await replay());

    expect(report).toMatchObject({ examined: 2, inserted: 1 });
    expect(report.diverged.map((gap) => gap.subjectId)).toEqual(["ord_zero"]);
    expect(repo.rows.size).toBe(1);
  });

  it("un sujet qui porte déjà un autre premier paiement est signalé, rien n'est écrit", async () => {
    const { repo, settlement, replay } = harness();
    repo.seed(line("ord_1", "pi_1", "pending"));
    settlement.references = [reference("ord_1", "pi_autre", "pending")];

    const report = replayed(await replay());

    expect(report.diverged).toEqual([
      {
        subjectType: "order",
        subjectId: "ord_1",
        providerRef: "pi_autre",
        line: null,
        subject: "pending",
      },
    ]);
    expect(repo.rows.size).toBe(1);
  });
});
