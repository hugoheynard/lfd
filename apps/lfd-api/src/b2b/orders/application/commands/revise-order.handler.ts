import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { OrderRevisionToSave, RevisableOrder } from "../../domain/entities/order-revision.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import {
  OrderRevisedElsewhereError,
  QuantitiesOnlyAfterArrestError,
} from "../../domain/errors/order-revision-errors.js";
import { OrderRevisionRepository } from "../../domain/ports/order-revision.repository.js";
import { ensureTotalSeen } from "../../domain/services/seen-total.js";
import {
  isQuantitiesOnly,
  type RevisionScope,
} from "../../domain/services/revision-after-arrest.js";
import { OrderRevising } from "../services/order-revising.service.js";
import { OrderRevisionRecording } from "../services/order-revision-recording.js";
import { RevisionWall } from "../services/revision-wall.js";
import { ReviseOrderCommand, type ReviseOrderResult } from "./revise-order.command.js";

/**
 * **Modifier une commande** (voir
 * `documentation/commandes/modification/modifier-une-commande.md`, § 2.2 « Le chemin d'une modification »).
 *
 * ## L'ordre des gestes
 *
 * 1. Hors verrou : le mur, la révision attendue (R7), la règle (R1), puis la
 *    recomposition entière ({@link OrderRevising}), puis le total vu (doc
 *    `modifier-une-commande.md`, §2.3 (R14) — après les refus de règlement, R15) — tous
 *    les refus avant toute écriture, aucun appel d'un autre bloc sous un verrou.
 * 2. La transaction : ligne `orders` verrouillée et relue, révision et règle
 *    rejugées sous le verrou, puis l'écriture ({@link OrderRevisionRecording},
 *    partagée avec la hausse payée, plan S2 §2.6) : le guichet du fournil sous le verrou de
 *    chaque journée touchée (§ 2.8 — « inscrite » refuse et annule tout), la
 *    journée nouvelle tenue ouverte, l'écriture conditionnée, la ligne
 *    d'encaissement recalée (au compte), et les deux faits durables.
 *
 * Aucune carte : M1 refuse une commande payable par carte (§ 2.7, lot M2).
 *
 * ## Une commande prise sur la vitrine (plan du jour J, §13, lot L5)
 *
 * Ni guichet du fournil, ni suivi du BL : l'ordre est la ligne `orders`,
 * puis le verrou du stock, et le reste y est rejugé sur les hausses.
 *
 * ## Après l'arrêt du plan (plan A2, § 7)
 *
 * L'équipe d'une commande au compte change encore les QUANTITÉS : la portée
 * `quantities` (statut déjà inscrit) refuse tôt tout autre changement, et
 * les ateliers ({@link OrderWorkshopRevision}) révisent le fournil puis le
 * colisage sous leurs verrous. Le BL prévu suit, après l'écriture de la
 * commande : `orders` → journée → feuille → BL.
 */
@CommandHandler(ReviseOrderCommand)
export class ReviseOrderHandler implements ICommandHandler<ReviseOrderCommand, ReviseOrderResult> {
  constructor(
    private readonly wall: RevisionWall,
    private readonly revising: OrderRevising,
    private readonly revisions: OrderRevisionRepository,
    private readonly recording: OrderRevisionRecording,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(command: ReviseOrderCommand): Promise<ReviseOrderResult> {
    const current = await this.wall.find(command.orderId, command.actor);
    ensureExpected(current, command.expectedRevision);
    const scope = await this.revising.ensureRevisable(current, command.actor.kind, "revise");
    const revision = await this.revising.compose(current, command.content, command.actor, {
      requireChange: true,
      // M1 juge à l'horloge (plan S2, R6).
      decidedAt: this.clock.now(),
    });
    ensureWithinScope(current, revision, scope);
    // R14, R15 (plan S2) : le règlement a parlé (ensureRevisable, compose) ;
    // on ne fait pas revalider un montant qu'on refuserait de toute façon.
    ensureTotalSeen(revision.totalAfterCents, command.expectedTotalCents);
    await this.unitOfWork.run(() => this.record(command, revision));
    return {
      id: revision.orderId,
      revision: revision.toRevision,
      totalCents: revision.totalAfterCents,
      previousTotalCents: revision.totalBeforeCents,
    };
  }

  private async record(command: ReviseOrderCommand, revision: OrderRevisionToSave): Promise<void> {
    const locked = await this.revisions.lock(command.orderId);
    if (locked === null) {
      throw new OrderNotFoundError(command.orderId);
    }
    ensureExpected(locked, command.expectedRevision);
    ensureWithinScope(
      locked,
      revision,
      await this.revising.ensureRevisable(locked, command.actor.kind, "revise"),
    );
    await this.recording.record(locked, revision, command.actor);
  }
}

/**
 * Plan A2, § 7 : une commande que son statut dit déjà inscrite ne change que
 * des quantités. Le guichet du fournil le rejuge sous le verrou de la journée.
 *
 * @throws {QuantitiesOnlyAfterArrestError}
 */
function ensureWithinScope(
  order: RevisableOrder,
  revision: OrderRevisionToSave,
  scope: RevisionScope,
): void {
  if (scope === "quantities" && !isQuantitiesOnly(order.lines, revision)) {
    throw new QuantitiesOnlyAfterArrestError(order.orderId);
  }
}

/** R7 : la modification porte la révision qu'elle corrige. */
function ensureExpected(order: RevisableOrder, expectedRevision: number): void {
  if (order.revision !== expectedRevision) {
    throw new OrderRevisedElsewhereError(order.orderId, expectedRevision);
  }
}
