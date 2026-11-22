import { DeclaredCardAccountDefaults } from "../../../../../platform/config/card-accounts.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { RegisteredSubjectSettlements } from "../../../../channels/subjects/index.js";
import { CardPayment } from "../../../domain/entities/card-payment.js";
import type {
  CardIntentState,
  RetrievedIntent,
} from "../../../domain/ports/card-provider-types.js";
import { PendingCardPaymentsReader } from "../../../domain/ports/pending-card-payments.reader.js";
import type { ProviderCheckSelection } from "../../../domain/services/provider-check-schedule.js";
import type { CardPaymentState } from "../../../domain/value-objects/card-payment-state.js";
import { PaymentAccount } from "../../../domain/value-objects/payment-account.js";
import { PaymentSubject } from "../../../domain/value-objects/payment-subject.js";
import { BlockCardPayments } from "../../block-card-payments.js";
import { CardAccountChoice } from "../../card-account-choice.js";
import { IntentOutcomeRecorder } from "../../intent-outcome-recorder.js";
import {
  InMemoryCardPayments,
  OutsideWorkCardProvider,
  RecordingDurable,
  StaticCardProviders,
  TestSubjectSettlement,
  Timeline,
  TimelineUnitOfWork,
} from "../../__tests__/card-payment-doubles.js";
import { RecordingLinkPaymentNotice } from "../../__tests__/recording-link-payment-notice.js";
import { SweepPendingCardPaymentsHandler } from "../sweep-pending-card-payments.handler.js";

/** L'instant du balayage — rien ne le compare à l'heure réelle. */
const NOW = new Date("2030-01-10T09:00:00.000Z");

/** La file rend ce qu'on lui donne, dans l'ordre, et garde la sélection demandée. */
class ListedPendingPayments extends PendingCardPaymentsReader {
  asked: ProviderCheckSelection | null = null;

  constructor(private readonly ids: readonly string[]) {
    super();
  }

  dueForProviderCheck(selection: ProviderCheckSelection): Promise<readonly string[]> {
    this.asked = selection;
    return Promise.resolve(this.ids);
  }
}

/** Le prestataire répond par référence ; une référence absente : il ne répond pas. */
class ScriptedProvider extends OutsideWorkCardProvider {
  readonly states = new Map<string, CardIntentState>();

  override retrieveIntent(providerRef: string): Promise<RetrievedIntent> {
    this.intentState = this.states.get(providerRef) ?? null;
    return super.retrieveIntent(providerRef);
  }
}

function harness(ids: readonly string[]) {
  const timeline = new Timeline();
  const repo = new InMemoryCardPayments(timeline);
  const uow = new TimelineUnitOfWork(timeline);
  const provider = new ScriptedProvider(uow);
  const settlement = new TestSubjectSettlement(timeline);
  const providers = new StaticCardProviders(new Map([["lfc-stripe", provider]]));
  const clock = new FixedClock(NOW);
  const cards = new BlockCardPayments(
    new CardAccountChoice(new DeclaredCardAccountDefaults({ order: "lfc-stripe" }), providers),
    providers,
    repo,
    new FixedIdGenerator("pay"),
    clock,
    uow,
    new IntentOutcomeRecorder(
      repo,
      new RegisteredSubjectSettlements([settlement]),
      new RecordingDurable(timeline),
      clock,
      new RecordingLinkPaymentNotice(timeline),
    ),
  );
  const pending = new ListedPendingPayments(ids);
  const handler = new SweepPendingCardPaymentsHandler(pending, repo, cards, clock);
  return { repo, provider, handler, pending, timeline, settlement };
}

function seed(repo: InMemoryCardPayments, id: string, state: CardPaymentState): void {
  repo.seed(
    CardPayment.adopt(
      {
        id,
        subject: PaymentSubject.of("order", `ord_${id}`),
        account: PaymentAccount.of("lfc-stripe"),
        providerRef: `pi_${id}`,
        role: "first",
        amountCents: 1_000,
        at: NOW,
      },
      state,
    ),
  );
}

describe("SweepPendingCardPaymentsHandler", () => {
  it("compte chaque issue, et un échec n'arrête pas les suivants", async () => {
    const { repo, provider, handler, settlement } = harness(["a", "b", "c", "d", "e", "f"]);
    for (const id of ["a", "c", "d", "e", "f"]) {
      seed(repo, id, "pending");
    }
    seed(repo, "b", "paid");
    provider.states.set("pi_a", "succeeded");
    provider.states.set("pi_b", "succeeded");
    provider.states.set("pi_d", "canceled");
    provider.states.set("pi_e", "awaiting_payment");
    // `pi_c` : le prestataire ne répond pas ; `f` : le sujet refuse.
    provider.states.set("pi_f", "succeeded");
    // Le sujet refuse tout encaissement (une commande annulée) : `a` et `f`.
    settlement.paidOutcome = "refused";

    const report = await handler.execute();

    expect(report).toEqual({
      examined: 6,
      settled: 0,
      replayed: 1,
      refusedBySubject: 2,
      closed: 1,
      pending: 1,
      failedChecks: 1,
    });
    expect(repo.state("a")).toBe("paid");
    expect(repo.state("f")).toBe("paid");
    expect(repo.state("d")).toBe("closed");
  });

  it("une intention réglée par le sujet compte `settled`", async () => {
    const { repo, provider, handler } = harness(["a"]);
    seed(repo, "a", "failed");
    provider.states.set("pi_a", "succeeded");

    await expect(handler.execute()).resolves.toMatchObject({ examined: 1, settled: 1 });
  });

  it("avance le curseur AVANT la relecture, même si elle échoue", async () => {
    const { repo, handler, timeline } = harness(["a"]);
    seed(repo, "a", "pending");

    const report = await handler.execute();

    expect(report.failedChecks).toBe(1);
    expect(repo.checkedAt.get("a")).toEqual(NOW);
    expect(timeline.steps[0]).toBe("repo.markProviderChecked:a");
  });

  it("aucun appel au prestataire ne part pendant une unité de travail ouverte", async () => {
    const { repo, provider, handler } = harness(["a", "b", "c"]);
    seed(repo, "a", "pending");
    seed(repo, "b", "pending");
    seed(repo, "c", "pending");
    provider.states.set("pi_a", "succeeded");
    provider.states.set("pi_b", "canceled");
    provider.states.set("pi_c", "succeeded");

    await handler.execute();

    expect(provider.calls).toEqual([
      "retrieveIntent:pi_a",
      "retrieveIntent:pi_b",
      "retrieveIntent:pi_c",
    ]);
    expect(provider.insideWork).toEqual([]);
  });

  it("demande la file à l'instant de l'horloge, au plus 50", async () => {
    const { handler, pending } = harness([]);

    await expect(handler.execute()).resolves.toEqual({
      examined: 0,
      settled: 0,
      replayed: 0,
      refusedBySubject: 0,
      closed: 0,
      pending: 0,
      failedChecks: 0,
    });
    expect(pending.asked?.limit).toBe(50);
    expect(pending.asked?.bands[0]?.createdBefore).toEqual(new Date(NOW.getTime() - 5 * 60 * 1000));
  });

  it("un paiement inconnu compte un échec, sans arrêter le passage", async () => {
    const { repo, provider, handler } = harness(["ghost", "a"]);
    seed(repo, "a", "pending");
    provider.states.set("pi_a", "succeeded");

    await expect(handler.execute()).resolves.toMatchObject({ failedChecks: 1, settled: 1 });
  });
});
