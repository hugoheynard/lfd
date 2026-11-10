import type { OrderRevisionOutcome } from "../../../../../../production/channels/commerce/index.js";
import { DirectUnitOfWork } from "../../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingJournal } from "../../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../../platform/time/fixed-clock.js";
import { FixedWallClock } from "../../../../../../platform/time/fixed-wall-clock.js";
import {
  StaffNotifier,
  type StaffNotice,
} from "../../../../../../staff/notifications/domain/ports/staff-notifier.js";
import { CardIncreaseProposal } from "../../../domain/entities/card-increase-proposal.js";
import type { RevisableOrder, RevisionActor } from "../../../domain/entities/order-revision.js";
import { CardIncreaseLease } from "../../../domain/ports/card-increase-lease.js";
import { RevisableOrderReader } from "../../../domain/ports/revisable-order.reader.js";
import type { OrderContent } from "../../../../application/services/order-content.js";
import type { OrderPlanGate } from "../../../../application/services/order-plan-gate.service.js";
import { CardIncreaseBell } from "../../services/card-increase-bell.js";
import { CardIncreaseOutcomes } from "../../services/card-increase-outcomes.js";
import { IncreaseOrderLabels } from "../../../../application/services/increase-order-labels.js";
import { RecordingProposals } from "../../services/__tests__/card-increase-doubles.js";
import {
  FixedStandings,
  RecordingLock,
  standing,
  type Steps,
} from "../../../../application/services/__tests__/order-card-doubles.js";
import { ApplyCardIncreaseHandler } from "../apply-card-increase.handler.js";
import { FixedProposalReader } from "./card-increase-scene.js";
import { RecordingDurable } from "../../../../application/commands/__tests__/durable-doubles.js";
import { openPlanGate } from "../../../../application/commands/__tests__/plan-doubles.js";
import { content, FixedRevisableOrders, NOW, reviseScene } from "./revision-scene.js";

/**
 * **La scène de l'exécuteur des hausses** (plan S2, §2.6) — la recomposition
 * et l'écriture RÉELLES de M1 (`reviseScene`), des doubles écrits à la main
 * en héritant des ports, et UNE chronologie (`trace`) pour l'ordre exact :
 * le bail, la relecture, puis `orders` → le projet → le fournil → l'écriture.
 */

export const CUSTOMER: RevisionActor = { kind: "customer", userId: "usr_1" };
export const MORE: OrderContent = content({ lines: [{ sku: "VIE-001", quantity: 20 }] });

/** Le bail, accordé ou non, et chaque prise notée. */
export class FixedLease extends CardIncreaseLease {
  constructor(
    private readonly steps: Steps,
    private readonly granted = true,
  ) {
    super();
  }

  claim(proposalId: string): Promise<boolean> {
    this.steps.seen.push(`lease:${proposalId}`);
    return Promise.resolve(this.granted);
  }
}

/** La relecture de la commande en panne (base injoignable). */
class FailingRevisableOrders extends RevisableOrderReader {
  constructor(private readonly failure: Error) {
    super();
  }

  find(): Promise<RevisableOrder | null> {
    return Promise.reject(this.failure);
  }
}

/** La cloche, notée. */
export class RecordingNotifier extends StaffNotifier {
  readonly notices: StaffNotice[] = [];

  notify(notices: readonly StaffNotice[]): Promise<void> {
    this.notices.push(...notices);
    return Promise.resolve();
  }
}

/** Le projet d'une hausse de `MORE`, au total visé, relu à l'état demandé. */
export function increaseProposal(
  order: RevisableOrder,
  targetTotalCents: number,
  options: {
    readonly state?: "ready" | "stalled" | "awaiting_payment";
    readonly author?: RevisionActor;
    readonly attempts?: number;
  } = {},
): CardIncreaseProposal {
  const author = options.author ?? CUSTOMER;
  const born = CardIncreaseProposal.propose({
    id: "prop_1",
    orderId: order.orderId,
    baseRevision: order.revision,
    content: { ...MORE },
    rules: { rulesOf: author.kind },
    totalBeforeCents: order.totalCents,
    targetTotalCents,
    author,
    paymentId: "pay_2",
    now: NOW,
    cutoff: null,
  });
  return CardIncreaseProposal.rehydrate({
    ...born.toPersistence(),
    state: options.state ?? "ready",
    attempts: options.attempts ?? 0,
  });
}

/** L'exécuteur monté sur la scène. */
export function applyScene(
  order: RevisableOrder,
  proposal: CardIncreaseProposal,
  options: {
    readonly plans?: OrderPlanGate;
    readonly desk?: OrderRevisionOutcome;
    readonly underLock?: RevisableOrder;
    readonly leaseGranted?: boolean;
    /** La relecture de la commande échoue : une panne, pas un refus. */
    readonly readFailure?: Error;
  } = {},
) {
  const revise = reviseScene(order, {
    plans: options.plans ?? openPlanGate(),
    ...(options.desk === undefined ? {} : { desk: options.desk }),
    ...(options.underLock === undefined ? {} : { underLock: options.underLock }),
  });
  const steps: Steps = { seen: revise.trace };
  const clock = new FixedClock(NOW);
  const wall = new FixedWallClock(NOW);
  const journal = new RecordingJournal();
  const durable = new RecordingDurable();
  const notifier = new RecordingNotifier();
  const proposals = new RecordingProposals(steps, proposal);
  const labels = new IncreaseOrderLabels(
    new FixedStandings([standing({ orderId: order.orderId, orderNumber: order.orderNumber })]),
  );
  const outcomes = new CardIncreaseOutcomes(
    new RecordingLock(steps),
    proposals,
    labels,
    journal,
    durable,
    new CardIncreaseBell(notifier, clock),
    new DirectUnitOfWork(),
    clock,
    wall,
  );
  const handler = new ApplyCardIncreaseHandler(
    new FixedLease(steps, options.leaseGranted ?? true),
    new FixedProposalReader(steps, proposal),
    options.readFailure === undefined
      ? new FixedRevisableOrders(order)
      : new FailingRevisableOrders(options.readFailure),
    revise.revising,
    revise.revisions,
    proposals,
    options.plans ?? openPlanGate(),
    revise.recording,
    outcomes,
    journal,
    new DirectUnitOfWork(),
    clock,
    wall,
  );
  return { handler, trace: revise.trace, revise, proposals, journal, durable, notifier, wall };
}
