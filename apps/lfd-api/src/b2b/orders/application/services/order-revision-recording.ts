import { Injectable } from "@nestjs/common";

import { CommerceOrderRevisedFact } from "../../../../delivery/channels/commerce/index.js";
import { DurablePublisher } from "../../../../platform/outbox/durable-publisher.js";
import { Clock } from "../../../../platform/time/clock.js";
import type {
  OrderRevisionToSave,
  RevisableOrder,
  RevisionActor,
} from "../../domain/entities/order-revision.js";
import { OrderRevisedElsewhereError } from "../../domain/errors/order-revision-errors.js";
import { OrderRevisedEvent } from "../../domain/events/order-revised.event.js";
import { AccountOrderRevaluation } from "../../domain/ports/account-order-revaluation.js";
import { DeliveryNoteFollowing } from "../../domain/ports/delivery-note-following.js";
import { OrderRevisionRepository } from "../../domain/ports/order-revision.repository.js";
import { OrderRevising } from "./order-revising.service.js";
import { OrderWorkshopRevision } from "./order-workshop-revision.js";

/**
 * **Écrire une révision jugée** (doc
 * `documentation/commandes/modification/modifier-une-commande.md`, §2.7.5 étape 3) —
 * extrait du `record()` de `ReviseOrderHandler`, sans changer son
 * comportement, pour que la hausse payée (`ApplyCardIncreaseHandler`)
 * écrive EXACTEMENT ce qu'écrit M1.
 *
 * 🔴 L'appelant tient déjà le verrou `orders` (`revisions.lock`) et a rejugé
 * ses propres règles dessous. Ici, dans l'ordre : le guichet du fournil sous
 * le verrou de chaque journée touchée (une commande sur stock n'en a pas), la
 * nouvelle journée tenue (ou le stock), l'écriture conditionnée, la ligne
 * d'encaissement recalée (au compte), le BL prévu (après l'arrêt, plan A2),
 * puis les deux faits durables de M1.
 */
@Injectable()
export class OrderRevisionRecording {
  constructor(
    private readonly revising: OrderRevising,
    private readonly revisions: OrderRevisionRepository,
    private readonly workshops: OrderWorkshopRevision,
    private readonly revaluation: AccountOrderRevaluation,
    private readonly deliveryNotes: DeliveryNoteFollowing,
    private readonly durable: DurablePublisher,
    private readonly clock: Clock,
  ) {}

  /**
   * @throws {OrderRevisedElsewhereError} l'écriture conditionnée n'a rien franchi.
   * @throws les refus du guichet du fournil et de la journée tenue.
   */
  async record(
    locked: RevisableOrder,
    revision: OrderRevisionToSave,
    actor: RevisionActor,
  ): Promise<void> {
    // Plan du jour J, §13 : une commande sur stock n'a jamais été inscrite au
    // fournil — ni guichet (et donc ni verrou de journée), ni BL à suivre :
    // le sien naît à la remise. `holdSupply` prend alors le verrou du stock.
    const afterArrest =
      locked.supply === "shelf" ? false : await this.workshops.note(locked, revision, actor);
    await this.revising.holdSupply(locked, revision, actor);
    const now = this.clock.now();
    if (!(await this.revisions.save(revision, actor, now))) {
      // Sous le verrou, révision et règle venaient de passer : ne pas franchir
      // veut dire un état que le `where` refuse. Le dire plutôt qu'écrire.
      throw new OrderRevisedElsewhereError(revision.orderId, revision.fromRevision);
    }
    if (revision.onAccount) {
      await this.revaluation.revalue(revision.orderId, revision.totalAfterCents, now);
    }
    if (afterArrest) {
      // Plan A2 : le BL prévu se réécrit sur la commande qu'on vient d'écrire.
      await this.deliveryNotes.followRevision(revision.orderId);
    }
    await this.publish(revision, actor);
  }

  private async publish(revision: OrderRevisionToSave, actor: RevisionActor): Promise<void> {
    await this.durable.publish(
      new OrderRevisedEvent(
        revision.orderId,
        revision.orderNumber,
        revision.placedByUserId,
        revision.toRevision,
        actor,
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
