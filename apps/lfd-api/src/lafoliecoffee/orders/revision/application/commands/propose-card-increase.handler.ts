import type { CardComplementPaymentView } from "@lfd/contracts";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import {
  type CardPaymentPreparation,
  CardPayments,
  type PreparedCardPayment,
} from "../../../../../card-payment/channels/requests/index.js";
import { OrderInscriptionReader } from "../../../../../production/channels/commerce/index.js";
import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { IdGenerator } from "../../../../../platform/id/id-generator.js";
import { Journal } from "../../../../../platform/journal/journal.js";
import { Clock } from "../../../../../platform/time/clock.js";
import { CardIncreaseProposal } from "../../domain/entities/card-increase-proposal.js";
import type { OrderRevisionToSave, RevisableOrder } from "../../domain/entities/order-revision.js";
import { CardIncreaseOnShelfOrderError } from "../../domain/errors/card-increase-proposal-errors.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import {
  OrderNotRevisableError,
  OrderRevisedElsewhereError,
} from "../../domain/errors/order-revision-errors.js";
import { CardIncreaseProposalRepository } from "../../domain/ports/card-increase-proposal.repository.js";
import { OrderRevisionRepository } from "../../domain/ports/order-revision.repository.js";
import { ensureTotalSeen } from "../../../domain/services/seen-total.js";
import { CardIncreaseAbandonment } from "../services/card-increase-abandonment.js";
import { increaseProposedFact } from "../services/card-increase-facts.js";
import {
  ORDER_CARD_SUBJECT_TYPE,
  orderCardSubject,
  orderCardTag,
} from "../../../application/services/order-card-subject.js";
import type { OrderContent } from "../../../application/services/order-content.js";
import { OrderCutoffGate } from "../../../application/services/order-cutoff-gate.service.js";
import { OrderRevising } from "../services/order-revising.service.js";
import { RevisionWall } from "../services/revision-wall.js";
import { ProposeCardIncreaseCommand } from "./propose-card-increase.command.js";

/** Ce que l'étape hors verrou a établi, et que la transaction rejuge. */
interface ProposedFrame {
  readonly revision: OrderRevisionToSave;
  readonly released: CardIncreaseProposal | null;
  readonly prepared: PreparedCardPayment;
  /** L'heure limite la plus proche des deux journées, ou `null` (Q1). */
  readonly cutoff: Date | null;
}

/**
 * **Demander une hausse payée par carte** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.3), dans
 * l'ordre exact du plan :
 *
 * 1. Hors verrou, comme M1 : le mur, la révision corrigée (R7), hors stock
 *    (R1), `ensureRevisable` (chemin `revise`, R2 ter), la recomposition —
 *    l'agrégat exige `card_complement`, sinon refus nommé (R2 bis, R15) —,
 *    puis le total vu (R14) avant toute préparation.
 * 2. Le remplacement (R5) : un projet du même auteur qui attend son paiement
 *    voit son intention annulée, hors transaction ; un autre auteur refuse.
 * 3. L'intention du complément préparée hors transaction.
 * 4. La transaction : `orders` verrouillée, R7 et la règle rejugées, la
 *    journée non inscrite (lue au fournil, sans rien inscrire), l'ancien
 *    projet abandonné par une écriture conditionnée (rien d'écrit ⇒ refus),
 *    le paiement rattaché (`complement`), le nouveau projet, le journal.
 * 5. Un échec ⇒ l'intention rendue (`release`).
 * 6. La réponse : de quoi monter le formulaire de carte.
 */
@CommandHandler(ProposeCardIncreaseCommand)
export class ProposeCardIncreaseHandler implements ICommandHandler<
  ProposeCardIncreaseCommand,
  CardComplementPaymentView
> {
  constructor(
    private readonly wall: RevisionWall,
    private readonly revising: OrderRevising,
    private readonly revisions: OrderRevisionRepository,
    private readonly inscriptions: OrderInscriptionReader,
    private readonly abandonment: CardIncreaseAbandonment,
    private readonly proposals: CardIncreaseProposalRepository,
    private readonly cards: CardPayments,
    private readonly cutoffs: OrderCutoffGate,
    private readonly journal: Journal,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: ProposeCardIncreaseCommand): Promise<CardComplementPaymentView> {
    const current = await this.wall.find(command.orderId, command.actor);
    const revision = await this.composed(current, command);
    const cutoff = await this.cutoffOf(current, command.content);
    const released = await this.abandonment.releaseForReplacement(current.orderId, command.actor);
    const preparation = await this.cards.prepare(
      ORDER_CARD_SUBJECT_TYPE,
      revision.totalAfterCents - revision.totalBeforeCents,
      orderCardTag(current.companyId),
    );
    const frame = { revision, released, prepared: preparation.prepared, cutoff };
    try {
      const proposal = await this.unitOfWork.run(() => this.record(command, frame));
      return viewOf(proposal, preparation);
    } catch (error) {
      await this.cards.release(preparation.prepared);
      throw error;
    }
  }

  /** Étape 1 : tous les refus avant le prestataire, le règlement avant le total vu (R15). */
  private async composed(
    current: RevisableOrder,
    command: ProposeCardIncreaseCommand,
  ): Promise<OrderRevisionToSave> {
    ensureExpected(current, command.expectedRevision);
    if (current.supply === "shelf") {
      throw new CardIncreaseOnShelfOrderError(current.orderId);
    }
    await this.revising.ensureRevisable(current, command.actor.kind, "revise");
    const { revision } = await this.revising.compose(current, command.content, command.actor, {
      requireChange: true,
      decidedAt: this.clock.now(),
      expected: "card_complement",
    });
    ensureTotalSeen(revision.totalAfterCents, command.expectedTotalCents);
    return revision;
  }

  /** Étape 4, sous le verrou `orders`, puis le projet, puis `card-payment` (§2.3). */
  private async record(
    command: ProposeCardIncreaseCommand,
    frame: ProposedFrame,
  ): Promise<CardIncreaseProposal> {
    const locked = await this.revisions.lock(command.orderId);
    if (locked === null) {
      throw new OrderNotFoundError(command.orderId);
    }
    ensureExpected(locked, command.expectedRevision);
    await this.revising.ensureRevisable(locked, command.actor.kind, "revise");
    await this.ensureNotInscribed(locked);
    const label = { orderId: locked.orderId, orderNumber: locked.orderNumber };
    await this.abandonment.replaceLocked(frame.released, label);
    const attached = await this.cards.attach(
      orderCardSubject(locked.orderId),
      frame.prepared,
      "complement",
    );
    const proposal = CardIncreaseProposal.propose({
      id: this.ids.next(),
      orderId: locked.orderId,
      baseRevision: locked.revision,
      content: { ...command.content },
      // Le jour de décision est `created_at` (§2.6) : les règles n'en portent que l'auteur.
      rules: { rulesOf: command.actor.kind },
      totalBeforeCents: frame.revision.totalBeforeCents,
      targetTotalCents: frame.revision.totalAfterCents,
      author: command.actor,
      paymentId: attached.paymentId,
      now: this.clock.now(),
      cutoff: frame.cutoff,
    });
    await this.proposals.save(proposal);
    await this.journal.append(increaseProposedFact(proposal, label));
    return proposal;
  }

  /** La journée lue au guichet du fournil, sans rien inscrire : inscrite, la hausse est refusée (R1). */
  private async ensureNotInscribed(order: RevisableOrder): Promise<void> {
    const day = await this.inscriptions.inscribedDayOf(order.orderId);
    if (day !== null) {
      throw new OrderNotRevisableError(order.orderId, { kind: "inscribed", day });
    }
  }

  /**
   * L'heure limite qui borne le délai de paiement (Q1) : la plus proche de
   * l'ancienne et de la nouvelle journée, sur les articles des deux
   * compositions — celles que la modification du client a passées.
   */
  private async cutoffOf(order: RevisableOrder, content: OrderContent): Promise<Date | null> {
    const skus = [
      ...new Set([...order.lines.map((line) => line.sku), ...content.lines.map((l) => l.sku)]),
    ];
    const days = [...new Set([order.serviceDay, content.requestedDeliveryDate])].filter(
      (day): day is string => day !== null,
    );
    const limits = await Promise.all(days.map((day) => this.cutoffs.decide(skus, day)));
    const times = limits.flatMap((decision) =>
      decision.limit === null ? [] : [decision.limit.getTime()],
    );
    return times.length === 0 ? null : new Date(Math.min(...times));
  }
}

/** R7 : la hausse porte la révision qu'elle corrige. */
function ensureExpected(order: RevisableOrder, expectedRevision: number): void {
  if (order.revision !== expectedRevision) {
    throw new OrderRevisedElsewhereError(order.orderId, expectedRevision);
  }
}

function viewOf(
  proposal: CardIncreaseProposal,
  preparation: CardPaymentPreparation,
): CardComplementPaymentView {
  return {
    proposalId: proposal.id,
    complementCents: proposal.complementCents,
    clientSecret: preparation.clientSecret,
    publishableKey: preparation.publishableKey,
    expiresAt: proposal.toPersistence().expiresAt.toISOString(),
  };
}
