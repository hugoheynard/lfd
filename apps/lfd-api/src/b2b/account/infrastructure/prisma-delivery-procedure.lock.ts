import { Injectable } from "@nestjs/common";

import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { DeliveryProcedureLock } from "../domain/ports/delivery-procedure.lock.js";

/** Espace de noms de la clé : deux verrous consultatifs d'usages différents ne se croisent pas. */
const LOCK_NAMESPACE = "account.delivery-procedure:";

/**
 * Le verrou a été demandé hors d'une unité de travail.
 *
 * Une faute de câblage, pas un cas métier : un `pg_advisory_xact_lock` émis en
 * autocommit est relâché à la fin de sa propre instruction, et l'écriture qui
 * suit ne serait plus sérialisée. On refuse bruyamment plutôt que de laisser
 * deux enregistrements s'effacer l'un l'autre en silence.
 */
export class DeliveryProcedureLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "account.delivery_procedure.lock_outside_transaction",
      "Le verrou de procédure de livraison exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/**
 * Adaptateur Postgres du verrou de procédure — calqué sur
 * `PrismaPersonAttachmentLock`.
 *
 * `pg_advisory_xact_lock` plutôt qu'un `SELECT … FOR UPDATE` sur la racine :
 * la racine n'existe pas encore au premier ajout, et c'est précisément deux
 * premiers ajouts simultanés qu'il faut aussi mettre en file. Le verrou est
 * relâché au `COMMIT` ou au `ROLLBACK`, jamais oublié.
 *
 * La clé porte la société ET l'adresse : le mur est dans la clé comme dans les
 * requêtes, et deux adresses ne s'attendent jamais l'une l'autre.
 */
@Injectable()
export class PrismaDeliveryProcedureLock extends DeliveryProcedureLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async acquire(companyId: string, addressId: string): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new DeliveryProcedureLockOutsideTransactionError();
    }
    const key = `${LOCK_NAMESPACE}${companyId}/${addressId}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}
