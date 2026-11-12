import type { AddressPointKind } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { currentTransaction } from "../../platform/database/transaction.store.js";
import { AddressSuggestionLockOutsideTransactionError } from "../domain/errors/address-suggestion-errors.js";
import { AddressSuggestionDecisionLock } from "../domain/ports/address-suggestion-decision.lock.js";

/** L'espace de noms du verrou : aucune autre clé consultative ne le porte. */
const SUGGESTION_LOCK_NAMESPACE = "delivery_address_suggestion:";

/**
 * `pg_advisory_xact_lock` par (adresse, sorte) : il couvre aussi une
 * suggestion sans décision, que `FOR UPDATE` ne verrouillerait pas — c'est
 * justement le cas de la course (deux premières décisions). Relâché au
 * `COMMIT` de l'unité de travail ; le compte qui suit, en READ COMMITTED,
 * voit ce que le geste concurrent a validé pendant l'attente.
 */
@Injectable()
export class PrismaAddressSuggestionDecisionLock extends AddressSuggestionDecisionLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  decisionsSoFar(addressId: string, kind: AddressPointKind): Promise<number> {
    return this.prisma.deliveryAddressSuggestionDecision.count({ where: { addressId, kind } });
  }

  async holdAndCount(addressId: string, kind: AddressPointKind): Promise<number> {
    if (currentTransaction() === undefined) {
      throw new AddressSuggestionLockOutsideTransactionError();
    }
    const key = `${SUGGESTION_LOCK_NAMESPACE}${addressId}:${kind}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    return this.decisionsSoFar(addressId, kind);
  }
}
