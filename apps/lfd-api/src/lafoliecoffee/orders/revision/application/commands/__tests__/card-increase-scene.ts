import { inMemoryIntents } from "../../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedRecipients } from "../../../../application/commands/__tests__/intake-doubles.js";
import {
  type AttachedCardPayment,
  type CardPaymentCancellation,
  type CardPaymentLabel,
  type CardPaymentPreparation,
  type CardIntentState,
  CardPayments,
  type CardProviderSettlement,
  type PreparedCardPayment,
  type RetrievedCardPayment,
} from "../../../../../../payment/channels/requests/index.js";
import type { CardSubject } from "../../../../../../payment/channels/subjects/index.js";
import { OrderInscriptionReader } from "../../../../../../production/channels/commerce/index.js";
import { DirectUnitOfWork } from "../../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { HeldAfterCommit } from "../../../../../../platform/database/__tests__/held-after-commit.js";
import { FixedIdGenerator } from "../../../../../../platform/id/fixed-id-generator.js";
import { RecordingJournal } from "../../../../../../platform/journal/__tests__/recording-journal.js";
import { FixedClock } from "../../../../../../platform/time/fixed-clock.js";
import { InMemoryProductCatalog } from "../../../../../catalog/infrastructure/in-memory-product-catalog.js";
import type { CardIncreaseProposal } from "../../../domain/entities/card-increase-proposal.js";
import type { RevisableOrder } from "../../../domain/entities/order-revision.js";
import { CardIncreaseProposalReader } from "../../../domain/ports/card-increase-proposal.reader.js";
import { CardIncreaseAbandonment } from "../../services/card-increase-abandonment.js";
import { CardIncreaseCancellation } from "../../../../cancellation/application/services/card-increase-cancellation.js";
import { deadlineOf } from "../../../../application/services/__tests__/order-deadline-of.js";
import { RevisionWall } from "../../services/revision-wall.js";
import { RecordingProposals } from "../../services/__tests__/card-increase-doubles.js";
import { Steps } from "../../../../application/services/__tests__/order-card-doubles.js";
import { ProposeCardIncreaseHandler } from "../propose-card-increase.handler.js";
import { RevisionCutoffs } from "../../services/revision-cutoffs.js";
import { ConsignedOverrides } from "../../../../domain/ports/__tests__/item-limit-override-doubles.js";
import type { ItemLimitOverride } from "../../../../domain/services/item-limit-overrides.js";
import {
  CATALOG,
  FixedRevisableOrders,
  InMemoryOrderRevisions,
  NOW,
  OneRoleAccess,
  revisingAt,
} from "./revision-scene.js";

/**
 * **La scène de la hausse par carte** (plan S2, §2.4, §2.5) — la recomposition
 * réelle de M1 (`revisingAt`), et des doubles écrits à la main en héritant des
 * ports. Une chronologie commune (`Steps`) dit l'ordre exact des gestes : le
 * prestataire hors verrou, puis `orders`, puis le projet, puis `card-payment`.
 */

/** Le projet vivant, lu SANS verrou — celui que l'étape 2 voit. */
export class FixedProposalReader extends CardIncreaseProposalReader {
  constructor(
    private readonly steps: Steps,
    private readonly proposal: CardIncreaseProposal | null,
  ) {
    super();
  }

  liveOf(orderId: string): Promise<CardIncreaseProposal | null> {
    this.steps.seen.push(`liveOf:${orderId}`);
    return Promise.resolve(this.proposal?.live === true ? this.proposal : null);
  }

  find(proposalId: string): Promise<CardIncreaseProposal | null> {
    this.steps.seen.push(`find:${proposalId}`);
    return Promise.resolve(this.proposal?.id === proposalId ? this.proposal : null);
  }

  appliedPaymentsOf(orderId: string): Promise<readonly string[]> {
    this.steps.seen.push(`appliedPaymentsOf:${orderId}`);
    const proposal = this.proposal;
    return Promise.resolve(
      proposal?.state === "applied" ? [proposal.toPersistence().paymentId] : [],
    );
  }
}

/** Le bloc `card-payment`, par son canal : chaque geste noté dans la chronologie. */
export class IncreaseCardPayments extends CardPayments {
  cancellation: CardPaymentCancellation = { kind: "cancelled" };
  intentState: CardIntentState = "awaiting_payment";
  attachFailure: Error | null = null;
  readonly released: PreparedCardPayment[] = [];
  /** Les libellés reçus par `prepare`, dans l'ordre. */
  readonly labels: CardPaymentLabel[] = [];

  constructor(private readonly steps: Steps) {
    super();
  }

  prepare(
    subjectType: string,
    amountCents: number,
    tag: string,
    label: CardPaymentLabel,
  ): Promise<CardPaymentPreparation> {
    this.labels.push(label);
    this.steps.seen.push(`prepare:${subjectType}:${String(amountCents)}:${tag}`);
    return Promise.resolve({
      prepared: { account: "lfc-stripe", providerRef: "pi_complement", amountCents },
      collection: {
        kind: "embedded",
        provider: "stripe",
        publishableKey: "pk_test",
        token: "pi_complement_secret",
      },
    });
  }

  attach(
    subject: CardSubject,
    prepared: PreparedCardPayment,
    role: string,
  ): Promise<AttachedCardPayment> {
    this.steps.seen.push(`attach:${subject.id}:${prepared.providerRef}:${role}`);
    return this.attachFailure === null
      ? Promise.resolve({ paymentId: "pay_new", providerRef: prepared.providerRef })
      : Promise.reject(this.attachFailure);
  }

  release(prepared: PreparedCardPayment): Promise<void> {
    this.steps.seen.push(`release:${prepared.providerRef}`);
    this.released.push(prepared);
    return Promise.resolve();
  }

  retrieve(paymentId: string): Promise<RetrievedCardPayment> {
    this.steps.seen.push(`retrieve:${paymentId}`);
    return Promise.resolve({
      paymentId,
      providerRef: "pi_complement",
      collection: {
        kind: "embedded",
        provider: "stripe",
        publishableKey: "pk_test",
        token: "pi_complement_secret",
      },
      state: this.intentState,
    });
  }

  cancel(paymentId: string): Promise<CardPaymentCancellation> {
    this.steps.seen.push(`cancel:${paymentId}`);
    return Promise.resolve(this.cancellation);
  }

  settleFromProvider(_paymentId: string): Promise<CardProviderSettlement> {
    return Promise.reject(new Error("non utilisé par le geste"));
  }

  adopt(): Promise<string> {
    return Promise.reject(new Error("non utilisé par le geste"));
  }
}

/** Le guichet du fournil, lu sans rien inscrire. */
export class FixedInscriptions extends OrderInscriptionReader {
  constructor(
    private readonly steps: Steps,
    private readonly day: string | null = null,
  ) {
    super();
  }

  inscribedDayOf(orderId: string): Promise<string | null> {
    this.steps.seen.push(`inscribed?:${orderId}`);
    return Promise.resolve(this.day);
  }
}

/** Le geste monté : la commande vue hors verrou, celle relue sous le verrou, le projet vivant. */
export function increaseScene(
  order: RevisableOrder,
  options: {
    readonly live?: CardIncreaseProposal | null;
    readonly underLock?: RevisableOrder;
    readonly proposalWritten?: boolean;
    readonly inscribedDay?: string | null;
    /** Les dépassements déjà consignés sur la commande. */
    readonly consigned?: readonly ItemLimitOverride[];
  } = {},
) {
  const steps = new Steps();
  const clock = new FixedClock(NOW);
  const live = options.live ?? null;
  const reader = new FixedProposalReader(steps, live);
  const proposals = new RecordingProposals(steps, live, options.proposalWritten ?? true);
  const cards = new IncreaseCardPayments(steps);
  const journal = new RecordingJournal();
  const wall = new RevisionWall(new FixedRevisableOrders(order), new OneRoleAccess("orders"));
  const revising = revisingAt(
    clock,
    options.consigned === undefined ? {} : { consigned: options.consigned },
  );
  const abandonment = new CardIncreaseAbandonment(reader, proposals, cards, journal, clock);
  const cutoffs = deadlineOf({
    cutoffs: { list: () => Promise.resolve([]) },
    catalog: new InMemoryProductCatalog(CATALOG),
  });
  const handler = new ProposeCardIncreaseHandler(
    wall,
    revising,
    new InMemoryOrderRevisions(options.underLock ?? order, steps.seen),
    new FixedInscriptions(steps, options.inscribedDay ?? null),
    abandonment,
    proposals,
    cards,
    new RevisionCutoffs(cutoffs, new ConsignedOverrides(options.consigned ?? [])),
    journal,
    new DirectUnitOfWork(),
    clock,
    new FixedIdGenerator("prop"),
    inMemoryIntents(),
    // Le client connecté du geste, connu de l'annuaire (le payeur du complément).
    new FixedRecipients({ usr_1: "client@example.test" }),
  );
  return { handler, steps, cards, journal, proposals, reader, abandonment, wall, revising };
}

/**
 * R9 : le projet de hausse vu par l'annulation de la commande — par défaut,
 * aucun projet vivant (les suites d'annulation d'avant S2.c).
 */
export function increaseCancellation(
  live: CardIncreaseProposal | null = null,
  trace: string[] = [],
) {
  const steps: Steps = { seen: trace };
  const proposals = new RecordingProposals(steps, live);
  const cards = new IncreaseCardPayments(steps);
  const afterCommit = new HeldAfterCommit();
  const journal = new RecordingJournal();
  const cancellation = new CardIncreaseCancellation(
    proposals,
    cards,
    afterCommit,
    journal,
    new FixedClock(NOW),
  );
  return { cancellation, steps, proposals, cards, afterCommit, journal };
}
