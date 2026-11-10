import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CommerceOrderRevisedFact } from "../../../../delivery/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type { OrderRevisionToSave, RevisableOrder } from "../../domain/entities/order-revision.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import {
  OrderRevisedElsewhereError,
  QuantitiesOnlyAfterArrestError,
} from "../../domain/errors/order-revision-errors.js";
import { OrderRevisedEvent } from "../../domain/events/order-revised.event.js";
import { AccountOrderRevaluation } from "../../domain/ports/account-order-revaluation.js";
import { DeliveryNoteFollowing } from "../../domain/ports/delivery-note-following.js";
import { OrderRevisionRepository } from "../../domain/ports/order-revision.repository.js";
import { ensureTotalSeen } from "../../domain/services/seen-total.js";
import {
  isQuantitiesOnly,
  type RevisionScope,
} from "../../domain/services/revision-after-arrest.js";
import { OrderRevising } from "../services/order-revising.service.js";
import { OrderWorkshopRevision } from "../services/order-workshop-revision.js";
import { RevisionWall } from "../services/revision-wall.js";
import { ReviseOrderCommand, type ReviseOrderResult } from "./revise-order.command.js";

/**
 * **Modifier une commande** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1, §9).
 *
 * ## L'ordre des gestes
 *
 * 1. Hors verrou : le mur, la révision attendue (R7), la règle (R1), puis la
 *    recomposition entière ({@link OrderRevising}), puis le total vu (plan
 *    `plan-s2-la-hausse.md`, R14 — après les refus de règlement, R15) — tous
 *    les refus avant toute écriture, aucun appel d'un autre bloc sous un verrou.
 * 2. La transaction : ligne `orders` verrouillée et relue, révision et règle
 *    rejugées sous le verrou, puis le guichet du fournil sous le verrou de
 *    chaque journée touchée (§9.1 — « inscrite » refuse et annule tout), la
 *    journée nouvelle tenue ouverte, l'écriture conditionnée, la ligne
 *    d'encaissement recalée (au compte), et les deux faits durables.
 *
 * Aucune carte : M1 refuse une commande payable par carte (§9, lot M2).
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
    private readonly workshops: OrderWorkshopRevision,
    private readonly revaluation: AccountOrderRevaluation,
    private readonly deliveryNotes: DeliveryNoteFollowing,
    private readonly durable: DurablePublisher,
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
    // Plan du jour J, §13 : une commande sur stock n'a jamais été inscrite au
    // fournil — ni guichet (et donc ni verrou de journée), ni BL à suivre :
    // le sien naît à la remise. `holdSupply` prend alors le verrou du stock.
    const afterArrest =
      locked.supply === "shelf"
        ? false
        : await this.workshops.note(locked, revision, command.actor);
    await this.revising.holdSupply(locked, revision, command.actor);
    const now = this.clock.now();
    if (!(await this.revisions.save(revision, command.actor, now))) {
      // Sous le verrou, révision et règle venaient de passer : ne pas franchir
      // veut dire un état que le `where` refuse. Le dire plutôt qu'écrire.
      throw new OrderRevisedElsewhereError(command.orderId, command.expectedRevision);
    }
    if (revision.onAccount) {
      await this.revaluation.revalue(revision.orderId, revision.totalAfterCents, now);
    }
    if (afterArrest) {
      // Plan A2 : le BL prévu se réécrit sur la commande qu'on vient d'écrire.
      await this.deliveryNotes.followRevision(revision.orderId);
    }
    await this.durable.publish(
      new OrderRevisedEvent(
        revision.orderId,
        revision.orderNumber,
        revision.placedByUserId,
        revision.toRevision,
        command.actor,
        revision.changes,
        revision.totalBeforeCents,
        revision.totalAfterCents,
      ).durableFact(),
    );
    // La livraison reprend une commande qui change d'acheminement (§9) : même transaction.
    await this.durable.publish(
      new CommerceOrderRevisedFact(
        revision.orderId,
        revision.toRevision,
        revision.routeChanged,
      ).durableFact(),
    );
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
