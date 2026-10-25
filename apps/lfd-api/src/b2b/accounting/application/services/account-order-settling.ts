import { Injectable } from "@nestjs/common";

import { AccountOrderSettlement } from "../../../orders/domain/ports/account-order-settlement.js";
import { OrderCollectionRepository } from "../../domain/ports/order-collection.repository.js";

/**
 * La comptabilité répond au solde d'une commande au compte : sa ligne
 * d'encaissement encore ouverte (`due` ou `excluded`) prend le montant facturable (plan E6c2, § 4
 * BLOQUANT 5). Sans ligne, rien à faire : elle naîtra du montant facturable
 * (`PrismaOrderCollectionRepository.load`).
 *
 * Implémente le port que la commande déclare ; relié dans
 * `appBootstrap/account-order-engagement.module.ts`.
 */
@Injectable()
export class AccountOrderSettling extends AccountOrderSettlement {
  constructor(private readonly collections: OrderCollectionRepository) {
    super();
  }

  async alignOnSettlement(orderId: string, amountCents: number, at: Date): Promise<void> {
    const existing = await this.collections.ofOrder(orderId);
    if (existing?.alignOnSettlement(amountCents, at) === true) {
      await this.collections.saveAll([existing]);
    }
  }
}
