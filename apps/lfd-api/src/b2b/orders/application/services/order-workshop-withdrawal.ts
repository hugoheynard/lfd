import { Injectable } from "@nestjs/common";

import { PackingWithdrawalDesk } from "../../../../packing/channels/commerce/index.js";
import {
  OrderWithdrawalDesk,
  ServiceDay,
  type OrderWithdrawalAllowance,
} from "../../../../production/channels/commerce/index.js";
import { OrderNotCancellableError } from "../../domain/errors/order-cancellation-errors.js";
import type { CancellationSubject } from "../../domain/ports/cancellation-subject.reader.js";
import type { CancellationActor } from "../../domain/services/cancellation-actor.js";
import type { CancellationAllowance } from "../../domain/services/cancellation-allowance.js";

/**
 * **Retirer la commande des ateliers** — le fournil, puis le colisage (plan A1,
 * `documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md`,
 * § 2.1), dans l'unité de travail du noyau `OrderCancellation`, après le
 * verrou de la ligne `orders`. Extrait du noyau, qui orchestre l'annulation :
 * celui-ci dit seulement aux ateliers d'oublier la commande.
 *
 * 1. Le guichet du fournil, sous le verrou de la journée. Une livraison y va
 *    toujours sous `before_inscription` : on ne défait ni bac ni tournée.
 * 2. Inscrite et retirée après l'inscription : le guichet du colisage, sous le
 *    verrou de la feuille, puis du bac, puis de la réserve (§ 2.4).
 *
 * Tout refus lève {@link OrderNotCancellableError} : l'appelant défait la
 * transaction, retrait au fournil compris.
 */
@Injectable()
export class OrderWorkshopWithdrawal {
  constructor(
    private readonly bakery: OrderWithdrawalDesk,
    private readonly packing: PackingWithdrawalDesk,
  ) {}

  /** @throws {OrderNotCancellableError} inscrite, livraison après l'arrêt, bac fermé, bac de livraison. */
  async withdraw(
    locked: CancellationSubject,
    allowance: CancellationAllowance,
    actor: CancellationActor,
  ): Promise<void> {
    // Sans jour de service, une commande n'est jamais producible (`planWhere`
    // lit `requested_delivery_date`) : il n'y a rien à retirer.
    if (locked.serviceDay === null) {
      return;
    }
    const day = locked.serviceDay;
    const outcome = await this.bakery.withdraw(
      ServiceDay.of(day),
      locked.orderId,
      bakeryAllowanceOf(locked, allowance),
    );
    switch (outcome) {
      case "withdrawn":
        return;
      case "inscribed":
        throw new OrderNotCancellableError(
          locked.orderId,
          allowance.allowance === "before_packing" && locked.fulfillmentMethod === "delivery"
            ? { kind: "delivery_after_plan", day }
            : { kind: "inscribed", day },
        );
      case "withdrawn_after_inscription":
        await this.withdrawFromPacking(locked.orderId, day, actor);
        return;
    }
  }

  private async withdrawFromPacking(
    orderId: string,
    day: string,
    actor: CancellationActor,
  ): Promise<void> {
    const outcome = await this.packing.withdraw(day, orderId, authorOf(actor));
    switch (outcome) {
      case "withdrawn":
        return;
      case "packed":
      case "delivery_bin":
        throw new OrderNotCancellableError(orderId, { kind: outcome });
    }
  }
}

/** Une livraison ne va jamais au-delà de l'inscription (plan A1, § 1 point 3). */
function bakeryAllowanceOf(
  locked: CancellationSubject,
  allowance: CancellationAllowance,
): OrderWithdrawalAllowance {
  return locked.fulfillmentMethod === "delivery" ? "before_inscription" : allowance.allowance;
}

/** L'auteur recopié sur les contenants annulés : la fiche staff, ou le client. */
function authorOf(actor: CancellationActor): string {
  switch (actor.kind) {
    case "staff":
      return actor.staffUserId;
    case "customer":
    case "guest":
      return actor.userId;
  }
}
