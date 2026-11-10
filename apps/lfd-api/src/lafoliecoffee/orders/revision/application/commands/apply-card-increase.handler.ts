import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../../platform/database/unit-of-work.js";
import { Journal } from "../../../../../platform/journal/journal.js";
import { BusinessError, DomainError } from "../../../../../platform/shared/errors/app-error.js";
import { Clock } from "../../../../../platform/time/clock.js";
import { WallClock } from "../../../../../platform/time/wall-clock.js";
import type { CardIncreaseProposal } from "../../domain/entities/card-increase-proposal.js";
import type { OrderRevisionToSave, RevisableOrder } from "../../domain/entities/order-revision.js";
import {
  CardIncreaseNotWrittenError,
  CardIncreasePlanClosedError,
  CardIncreaseTotalChangedError,
  increaseRefusalOf,
} from "../../domain/errors/card-increase-application-errors.js";
import { OrderNotFoundError } from "../../../domain/errors/order-errors.js";
import { OrderRevisedElsewhereError } from "../../domain/errors/order-revision-errors.js";
import { CardIncreaseLease } from "../../domain/ports/card-increase-lease.js";
import { CardIncreaseProposalReader } from "../../domain/ports/card-increase-proposal.reader.js";
import { CardIncreaseProposalRepository } from "../../domain/ports/card-increase-proposal.repository.js";
import { OrderRevisionRepository } from "../../domain/ports/order-revision.repository.js";
import { RevisableOrderReader } from "../../domain/ports/revisable-order.reader.js";
import { increaseAppliedFact } from "../services/card-increase-facts.js";
import { CardIncreaseOutcomes } from "../services/card-increase-outcomes.js";
import { frozenOrderContentOf } from "../../../application/services/frozen-increase-content.js";
import { OrderPlanGate } from "../../../application/services/order-plan-gate.service.js";
import { OrderRevising } from "../services/order-revising.service.js";
import { OrderRevisionRecording } from "../services/order-revision-recording.js";
import { ApplyCardIncreaseCommand } from "./apply-card-increase.command.js";

/** Le bail : plus long qu'une recomposition et une écriture, appels au fournil compris. */
export const CARD_INCREASE_LEASE_MS = 2 * 60 * 1000;

/**
 * **L'exécuteur des hausses payées** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.5) — la
 * figure de l'exécuteur des remboursements de `card-payment` (P1.b), dans
 * l'ordre exact du plan :
 *
 * 1. le bail (écriture validée seule, à l'horloge MURALE) ; pris, on sort ;
 * 2. HORS verrou : projet et commande relus, le contenu figé recomposé avec
 *    les règles de l'auteur et `decidedAt` = la naissance du projet (R6) —
 *    jamais l'horloge, gelée dans la requête d'un cron ;
 * 3. la transaction : `orders` (`revisions.lock`), le projet `FOR UPDATE`,
 *    `ready` exigé ; R7, la règle (`ensureRevisable`) ; la garde PROPRE au
 *    projet — plan arrêté ⇒ `plan_closed`, pour tous les auteurs (R6, Q5) ;
 *    le total recomposé = le total payé (R7) ; puis l'écriture de M1
 *    ({@link OrderRevisionRecording} : guichet du fournil, journée tenue,
 *    révision, faits durables), le projet `applied`, son journal ;
 * 4. un refus métier ⇒ `refused` dans une seconde transaction, le complément
 *    rendu après validation ({@link CardIncreaseOutcomes.refuse}) ;
 * 5. une panne ⇒ un essai de plus, puis `stalled` et la cloche.
 */
@CommandHandler(ApplyCardIncreaseCommand)
export class ApplyCardIncreaseHandler implements ICommandHandler<ApplyCardIncreaseCommand, void> {
  private readonly logger = new Logger(ApplyCardIncreaseHandler.name);

  constructor(
    private readonly lease: CardIncreaseLease,
    private readonly reader: CardIncreaseProposalReader,
    private readonly orders: RevisableOrderReader,
    private readonly revising: OrderRevising,
    private readonly revisions: OrderRevisionRepository,
    private readonly proposals: CardIncreaseProposalRepository,
    private readonly plans: OrderPlanGate,
    private readonly recording: OrderRevisionRecording,
    private readonly outcomes: CardIncreaseOutcomes,
    private readonly journal: Journal,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
    private readonly wall: WallClock,
  ) {}

  async execute(command: ApplyCardIncreaseCommand): Promise<void> {
    const wallNow = this.wall.elapsedNow();
    const until = new Date(wallNow.getTime() + CARD_INCREASE_LEASE_MS);
    if (!(await this.lease.claim(command.proposalId, until, wallNow))) {
      return;
    }
    const proposal = await this.reader.find(command.proposalId);
    if (proposal === null || proposal.state !== "ready") {
      return;
    }
    const orderId = proposal.toPersistence().orderId;
    try {
      const revision = await this.recompose(proposal);
      await this.unitOfWork.run(() => this.applyLocked(proposal, revision));
    } catch (error) {
      await this.settleFailure(proposal.id, orderId, error);
    }
  }

  /** Étape 2, hors verrou : la recomposition aux règles figées de l'auteur (R6). */
  private async recompose(proposal: CardIncreaseProposal): Promise<OrderRevisionToSave> {
    const frozen = proposal.toPersistence();
    const order = await this.orders.find(frozen.orderId);
    if (order === null) {
      throw new OrderNotFoundError(frozen.orderId);
    }
    ensureBase(order, frozen.baseRevision);
    const { revision } = await this.revising.compose(
      order,
      frozenOrderContentOf(proposal),
      frozen.author,
      {
        requireChange: true,
        rulesOf: frozen.rules.rulesOf,
        decidedAt: frozen.createdAt,
        expected: "card_complement",
      },
    );
    return revision;
  }

  /** Étape 3, sous `orders` puis le projet (§2.3). */
  private async applyLocked(
    proposal: CardIncreaseProposal,
    revision: OrderRevisionToSave,
  ): Promise<void> {
    const frozen = proposal.toPersistence();
    const locked = await this.revisions.lock(frozen.orderId);
    if (locked === null) {
      throw new OrderNotFoundError(frozen.orderId);
    }
    const live = await this.proposals.lockLiveOf(frozen.orderId);
    if (live === null || live.id !== proposal.id || live.state !== "ready") {
      return;
    }
    ensureBase(locked, frozen.baseRevision);
    await this.revising.ensureRevisable(locked, frozen.author.kind, "revise");
    await this.ensurePlanOpen(locked, revision);
    if (revision.totalAfterCents !== frozen.targetTotalCents) {
      throw new CardIncreaseTotalChangedError(
        locked.orderId,
        frozen.targetTotalCents,
        revision.totalAfterCents,
      );
    }
    await this.recording.record(locked, revision, frozen.author, "direct");
    live.apply(this.clock.now());
    if (!(await this.proposals.save(live))) {
      throw new CardIncreaseNotWrittenError(live.id, "appliqué");
    }
    const label = { orderId: locked.orderId, orderNumber: locked.orderNumber };
    await this.journal.append(increaseAppliedFact(live, label, revision.toRevision));
  }

  /**
   * R6 (Q5) : la garde propre au projet — le plan de la journée de la
   * commande modifiée est arrêté, quel que soit l'auteur. `ensureDayOpen` et
   * `holdDay` laissent passer l'équipe à date inchangée ; pas ici.
   */
  private async ensurePlanOpen(
    order: RevisableOrder,
    revision: OrderRevisionToSave,
  ): Promise<void> {
    if (revision.serviceDay !== null && (await this.plans.isClosed(revision.serviceDay))) {
      throw new CardIncreasePlanClosedError(order.orderId, revision.serviceDay);
    }
  }

  /** Étapes 4 et 5 : un refus métier se refuse, tout le reste est une panne. */
  private async settleFailure(proposalId: string, orderId: string, error: unknown): Promise<void> {
    if (error instanceof DomainError || error instanceof BusinessError) {
      await this.outcomes.refuse(proposalId, orderId, increaseRefusalOf(error));
      return;
    }
    const failure = error instanceof Error ? error.message : String(error);
    this.logger.warn(`Hausse non appliquée (projet ${proposalId}) : ${failure}`);
    await this.outcomes.fail(proposalId, orderId, failure);
  }
}

/** R7 : le projet corrige la révision sur laquelle il est né. */
function ensureBase(order: RevisableOrder, baseRevision: number): void {
  if (order.revision !== baseRevision) {
    throw new OrderRevisedElsewhereError(order.orderId, baseRevision);
  }
}
