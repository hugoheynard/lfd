import type { CardProviderSettlement } from "../../../../../card-payment/channels/requests/index.js";
import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { HeldAfterCommit } from "../../../../../platform/database/__tests__/held-after-commit.js";
import { RecordingJournal } from "../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import { FixedWallClock } from "../../../../../platform/time/fixed-wall-clock.js";
import { CardIncreaseProposal } from "../../../domain/entities/card-increase-proposal.js";
import { NoStalledComplementError } from "../../../domain/errors/card-increase-application-errors.js";
import { CardIncreaseSweepReader } from "../../../domain/ports/card-increase-sweep.reader.js";
import { CardIncreaseAbandonment } from "../../services/card-increase-abandonment.js";
import { CardIncreaseBell } from "../../services/card-increase-bell.js";
import { CardIncreaseDispatch } from "../../services/card-increase-dispatch.js";
import { CardIncreaseProviderChecks } from "../../services/card-increase-provider-checks.js";
import { IncreaseOrderLabels } from "../../services/increase-order-labels.js";
import {
  proposalAt,
  RecordingProposals,
  RecordingWake,
} from "../../services/__tests__/card-increase-doubles.js";
import {
  FixedStandings,
  RecordingLock,
  standing,
  Steps,
} from "../../services/__tests__/order-card-doubles.js";
import { ExpireCardIncreasesHandler } from "../expire-card-increases.handler.js";
import { RelaunchCardIncreaseCommand } from "../relaunch-card-increase.command.js";
import { RelaunchCardIncreaseHandler } from "../relaunch-card-increase.handler.js";
import { SweepCardIncreasesHandler } from "../sweep-card-increases.handler.js";
import { RecordingNotifier } from "./card-increase-apply-scene.js";
import { FixedProposalReader, IncreaseCardPayments } from "./card-increase-scene.js";

/**
 * **Les balayages des hausses et « Relancer »** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.5, §2.7.7) —
 * les cinq issues de l'annulation au délai, la vérification d'un webhook
 * perdu, le compte des contrôles en échec et sa cloche au 3ᵉ, et la relance
 * d'un projet en panne. Le prestataire HORS transaction, toujours.
 */

/** L'heure du mur : seules des durées relatives lui sont comparées. */
const WALL = new Date(0);

class FixedSweeps extends CardIncreaseSweepReader {
  readonly asked: string[] = [];

  constructor(
    private readonly lists: {
      readonly due?: readonly string[];
      readonly expired?: readonly string[];
      readonly awaiting?: readonly string[];
    },
  ) {
    super();
  }

  dueForApply(): Promise<readonly string[]> {
    this.asked.push("due");
    return Promise.resolve(this.lists.due ?? []);
  }

  expired(): Promise<readonly string[]> {
    this.asked.push("expired");
    return Promise.resolve(this.lists.expired ?? []);
  }

  awaitingSince(bornBefore: Date): Promise<readonly string[]> {
    this.asked.push(`awaiting<${bornBefore.toISOString()}`);
    return Promise.resolve(this.lists.awaiting ?? []);
  }
}

/** Le canal des cartes, où la vérification chez le prestataire se règle par le test. */
class CheckingCardPayments extends IncreaseCardPayments {
  settlement: CardProviderSettlement | Error = "pending";

  constructor(private readonly trail: Steps) {
    super(trail);
  }

  override settleFromProvider(paymentId: string): Promise<CardProviderSettlement> {
    this.trail.seen.push(`settleFromProvider:${paymentId}`);
    const settlement = this.settlement;
    return settlement instanceof Error ? Promise.reject(settlement) : Promise.resolve(settlement);
  }
}

class RecordingDispatch extends CardIncreaseDispatch {
  constructor(private readonly steps: Steps) {
    super();
  }

  applyNow(proposalId: string): Promise<void> {
    this.steps.seen.push(`apply:${proposalId}`);
    return proposalId === "prop_broken" ? Promise.reject(new Error("panne")) : Promise.resolve();
  }
}

function world(proposal: CardIncreaseProposal) {
  const steps = new Steps();
  const proposals = new RecordingProposals(steps, proposal);
  const cards = new CheckingCardPayments(steps);
  const journal = new RecordingJournal();
  const notifier = new RecordingNotifier();
  const clock = new FixedClock(WALL);
  const labels = new IncreaseOrderLabels(new FixedStandings([standing()]));
  const checks = new CardIncreaseProviderChecks(
    new RecordingLock(steps),
    proposals,
    labels,
    new CardIncreaseBell(notifier, clock),
    new DirectUnitOfWork(),
  );
  const reader = new FixedProposalReader(steps, proposal);
  return { steps, proposals, cards, journal, notifier, clock, labels, checks, reader };
}

function expireScene(proposal: CardIncreaseProposal) {
  const w = world(proposal);
  const handler = new ExpireCardIncreasesHandler(
    new FixedSweeps({ expired: [proposal.id] }),
    w.reader,
    w.cards,
    new CardIncreaseAbandonment(w.reader, w.proposals, w.cards, w.journal, w.clock),
    w.checks,
    w.labels,
    new RecordingLock(w.steps),
    new DirectUnitOfWork(),
    new FixedWallClock(WALL),
  );
  return { ...w, handler };
}

describe("ExpireCardIncreasesHandler — l'abandon au délai et ses cinq issues (§2.7)", () => {
  it.each(["cancelled", "already_cancelled"] as const)(
    "`%s` : l'intention annulée HORS transaction, puis sous `orders` le projet abandonné (cause `expired`)",
    async (kind) => {
      const scene = expireScene(proposalAt("awaiting_payment"));
      scene.cards.cancellation = { kind };

      expect(await scene.handler.execute()).toEqual({ abandoned: 1, settled: 0, retried: 0 });

      expect(scene.steps.seen).toEqual([
        "find:prop_1",
        "cancel:pay_2",
        "lock:ord_1",
        "lockLiveProposal:ord_1",
        "saveProposal:awaiting_payment→abandoned",
      ]);
      expect(scene.journal.facts[0]?.payload).toMatchObject({ cause: "expired" });
    },
  );

  it("`already_paid` : le chemin payé est rejoué par `settleFromProvider`, rien n'est abandonné", async () => {
    const scene = expireScene(proposalAt("awaiting_payment"));
    scene.cards.cancellation = { kind: "already_paid" };
    scene.cards.settlement = "paid";

    expect(await scene.handler.execute()).toEqual({ abandoned: 0, settled: 1, retried: 0 });

    expect(scene.steps.seen).toEqual(["find:prop_1", "cancel:pay_2", "settleFromProvider:pay_2"]);
    expect(scene.proposals.saved).toEqual([]);
  });

  it("`in_progress` : réessai au passage suivant, rien n'est compté", async () => {
    const scene = expireScene(proposalAt("awaiting_payment"));
    scene.cards.cancellation = { kind: "in_progress" };

    expect(await scene.handler.execute()).toEqual({ abandoned: 0, settled: 0, retried: 1 });

    expect(scene.proposals.saved).toEqual([]);
  });

  it("`unavailable` : réessai, `provider_checks + 1`, sans cloche avant le 3ᵉ", async () => {
    const proposal = proposalAt("awaiting_payment");
    const scene = expireScene(proposal);
    scene.cards.cancellation = { kind: "unavailable", reason: "délai dépassé" };

    expect(await scene.handler.execute()).toEqual({ abandoned: 0, settled: 0, retried: 1 });

    expect(proposal.toPersistence().providerChecks).toBe(1);
    expect(scene.proposals.saved).toEqual(["awaiting_payment"]);
    expect(scene.notifier.notices).toEqual([]);
  });

  it("`unavailable` pour la 3ᵉ fois : la cloche sonne, une fois", async () => {
    const proposal = CardIncreaseProposal.rehydrate({
      ...proposalAt("awaiting_payment").toPersistence(),
      providerChecks: 2,
    });
    const scene = expireScene(proposal);
    scene.cards.cancellation = { kind: "unavailable", reason: "délai dépassé" };

    await scene.handler.execute();

    expect(scene.notifier.notices.map((notice) => notice.kind)).toEqual([
      "order.card_increase_provider_unreachable",
    ]);
  });

  it("payé entre l'annulation et l'écriture : le délai est un plancher, le projet suit son cours", async () => {
    const scene = expireScene(proposalAt("ready"));

    expect(await scene.handler.execute()).toEqual({ abandoned: 0, settled: 0, retried: 0 });

    expect(scene.steps.seen).toEqual(["find:prop_1"]);
  });
});

describe("SweepCardIncreasesHandler — le balayage (§2.6, §2.7)", () => {
  function sweepScene(
    proposal: CardIncreaseProposal,
    lists: ConstructorParameters<typeof FixedSweeps>[0],
  ) {
    const w = world(proposal);
    const sweeps = new FixedSweeps(lists);
    const handler = new SweepCardIncreasesHandler(
      sweeps,
      w.reader,
      w.cards,
      w.checks,
      new RecordingDispatch(w.steps),
      new FixedWallClock(WALL),
    );
    return { ...w, handler, sweeps };
  }

  it("rend les projets `ready` dus à l'exécuteur, un à un ; l'échec de l'un ne prive pas les suivants", async () => {
    const scene = sweepScene(proposalAt("ready"), { due: ["prop_broken", "prop_1"] });

    expect(await scene.handler.execute()).toEqual({ applied: 2, checked: 0 });

    expect(scene.steps.seen).toEqual(["apply:prop_broken", "apply:prop_1"]);
  });

  it("vérifie chez le prestataire les compléments en attente depuis plus de cinq minutes", async () => {
    const scene = sweepScene(proposalAt("awaiting_payment"), { awaiting: ["prop_1"] });
    scene.cards.settlement = "paid";

    expect(await scene.handler.execute()).toEqual({ applied: 0, checked: 1 });

    expect(scene.sweeps.asked).toEqual([
      "due",
      `awaiting<${new Date(-5 * 60 * 1000).toISOString()}`,
    ]);
    expect(scene.steps.seen).toEqual(["find:prop_1", "settleFromProvider:pay_2"]);
  });

  it("une vérification qui échoue compte (`provider_checks`), sans lever", async () => {
    const proposal = proposalAt("awaiting_payment");
    const scene = sweepScene(proposal, { awaiting: ["prop_1"] });
    scene.cards.settlement = new Error("prestataire muet");

    await scene.handler.execute();

    expect(proposal.toPersistence().providerChecks).toBe(1);
    expect(proposal.toPersistence().attempts).toBe(0);
  });
});

describe("RelaunchCardIncreaseHandler — « Relancer » (§2.6, étape 5)", () => {
  function relaunchScene(proposal: CardIncreaseProposal) {
    const w = world(proposal);
    const wake = new RecordingWake();
    const afterCommit = new HeldAfterCommit();
    const handler = new RelaunchCardIncreaseHandler(
      new RecordingLock(w.steps),
      w.proposals,
      w.labels,
      w.journal,
      wake,
      afterCommit,
      new DirectUnitOfWork(),
      new FixedWallClock(WALL),
    );
    return { ...w, handler, wake, afterCommit };
  }

  it("`stalled → ready`, essais remis à zéro, journal, et l'exécuteur réveillé APRÈS validation", async () => {
    const proposal = CardIncreaseProposal.rehydrate({
      ...proposalAt("stalled").toPersistence(),
      attempts: 5,
    });
    const scene = relaunchScene(proposal);

    await scene.handler.execute(new RelaunchCardIncreaseCommand("ord_1"));

    expect(proposal.toPersistence()).toMatchObject({
      state: "ready",
      attempts: 0,
      nextAttemptAt: WALL,
    });
    expect(scene.journal.types()).toEqual(["order.card_increase_relaunched"]);
    expect(scene.wake.woken).toEqual([]);
    await scene.afterCommit.commit();
    expect(scene.wake.woken).toEqual(["prop_1"]);
  });

  it.each(["ready", "awaiting_payment"] as const)(
    "un projet `%s` : rien à relancer, refus nommé",
    async (state) => {
      const scene = relaunchScene(proposalAt(state));

      await expect(
        scene.handler.execute(new RelaunchCardIncreaseCommand("ord_1")),
      ).rejects.toBeInstanceOf(NoStalledComplementError);
      expect(scene.proposals.saved).toEqual([]);
    },
  );
});
