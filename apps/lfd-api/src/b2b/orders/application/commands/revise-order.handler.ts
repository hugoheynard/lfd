import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { CommerceOrderRevisedFact } from "../../../../delivery/channels/commerce/index.js";
import { UnitOfWork } from "../../../../platform/database/unit-of-work.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import { OrderRevisionDesk, ServiceDay } from "../../../../production/channels/commerce/index.js";
import type { OrderRevisionToSave, RevisableOrder } from "../../domain/entities/order-revision.js";
import { OrderNotFoundError } from "../../domain/errors/order-errors.js";
import {
  OrderNotRevisableError,
  OrderRevisedElsewhereError,
} from "../../domain/errors/order-revision-errors.js";
import { OrderRevisedEvent } from "../../domain/events/order-revised.event.js";
import { AccountOrderRevaluation } from "../../domain/ports/account-order-revaluation.js";
import { OrderRevisionRepository } from "../../domain/ports/order-revision.repository.js";
import { OrderRevising } from "../services/order-revising.service.js";
import { RevisionWall } from "../services/revision-wall.js";
import { ReviseOrderCommand, type ReviseOrderResult } from "./revise-order.command.js";

/**
 * **Modifier une commande** (plan
 * `documentation/commandes/modification/plan-modifier-une-commande.md`, M1, §9).
 *
 * ## L'ordre des gestes
 *
 * 1. Hors verrou : le mur, la révision attendue (R7), la règle (R1), puis la
 *    recomposition entière ({@link OrderRevising}) — tous les refus avant
 *    toute écriture, aucun appel d'un autre bloc sous un verrou.
 * 2. La transaction : ligne `orders` verrouillée et relue, révision et règle
 *    rejugées sous le verrou, puis le guichet du fournil sous le verrou de
 *    chaque journée touchée (§9.1 — « inscrite » refuse et annule tout), la
 *    journée nouvelle tenue ouverte, l'écriture conditionnée, la ligne
 *    d'encaissement recalée (au compte), et les deux faits durables.
 *
 * Aucune carte : M1 refuse une commande payable par carte (§9, lot M2).
 */
@CommandHandler(ReviseOrderCommand)
export class ReviseOrderHandler implements ICommandHandler<ReviseOrderCommand, ReviseOrderResult> {
  constructor(
    private readonly wall: RevisionWall,
    private readonly revising: OrderRevising,
    private readonly revisions: OrderRevisionRepository,
    private readonly desk: OrderRevisionDesk,
    private readonly revaluation: AccountOrderRevaluation,
    private readonly durable: DurablePublisher,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(command: ReviseOrderCommand): Promise<ReviseOrderResult> {
    const current = await this.wall.find(command.orderId, command.actor);
    ensureExpected(current, command.expectedRevision);
    await this.revising.ensureRevisable(current);
    const revision = await this.revising.compose(current, command.content, command.actor, {
      requireChange: true,
    });
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
    await this.revising.ensureRevisable(locked);
    await this.noteAtBakery(revision);
    await this.revising.holdDay(revision, command.actor);
    const now = this.clock.now();
    if (!(await this.revisions.save(revision, command.actor, now))) {
      // Sous le verrou, révision et règle venaient de passer : ne pas franchir
      // veut dire un état que le `where` refuse. Le dire plutôt qu'écrire.
      throw new OrderRevisedElsewhereError(command.orderId, command.expectedRevision);
    }
    if (revision.onAccount) {
      await this.revaluation.revalue(revision.orderId, revision.totalAfterCents, now);
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

  /**
   * Le guichet du fournil, sous le verrou de l'ancienne ET de la nouvelle
   * journée (§9.1). Sans jour, une commande n'est jamais producible : rien à
   * noter.
   */
  private async noteAtBakery(revision: OrderRevisionToSave): Promise<void> {
    const days = [
      ...new Set([revision.previousServiceDay, revision.serviceDay].filter((day) => day !== null)),
    ];
    if (days.length === 0) {
      return;
    }
    const outcome = await this.desk.note(
      days.map((day) => ServiceDay.of(day)),
      revision.orderId,
      revision.toRevision,
    );
    if (outcome === "inscribed") {
      throw new OrderNotRevisableError(revision.orderId, {
        kind: "inscribed",
        day: revision.previousServiceDay,
      });
    }
  }
}

/** R7 : la modification porte la révision qu'elle corrige. */
function ensureExpected(order: RevisableOrder, expectedRevision: number): void {
  if (order.revision !== expectedRevision) {
    throw new OrderRevisedElsewhereError(order.orderId, expectedRevision);
  }
}
