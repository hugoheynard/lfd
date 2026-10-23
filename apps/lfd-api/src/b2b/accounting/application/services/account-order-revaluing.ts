import { Injectable } from "@nestjs/common";

import { AccountOrderRevaluation } from "../../../orders/domain/ports/account-order-revaluation.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";

/**
 * La comptabilité répond à la modification d'une commande au compte : sa
 * ligne d'encaissement, si elle existe déjà, prend le nouveau total (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M1). Sans ligne,
 * rien à faire : elle naîtra du total relu de la commande.
 *
 * Implémente le port que la commande déclare ; relié dans
 * `appBootstrap/account-order-engagement.module.ts`. Dans l'unité de travail
 * de la révision, sous son verrou de ligne `orders`.
 */
@Injectable()
export class AccountOrderRevaluing extends AccountOrderRevaluation {
  constructor(private readonly collections: OrderCollectionRepository) {
    super();
  }

  /** @throws {OrderCollectionTransitionError} la ligne est déjà engagée (lot, prélèvement…). */
  async revalue(orderId: string, amountCents: number, at: Date): Promise<void> {
    const existing = await this.collections.ofOrder(orderId);
    if (existing === null) {
      return;
    }
    existing.revalue(amountCents, at);
    await this.collections.saveAll([existing]);
  }
}
