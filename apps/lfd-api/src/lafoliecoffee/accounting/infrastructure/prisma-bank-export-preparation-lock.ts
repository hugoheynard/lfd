import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import {
  BankExportPreparationLock,
  type BankExportKind,
} from "../domain/ports/bank-export-preparation-lock.js";

/** Espace de noms du verrou (même convention que `prisma-collection-lock.ts`). */
const LOCK_NAMESPACE = "accounting.bank_export_preparation:";

/** Demandé hors transaction : relâché aussitôt, il ne protégerait rien. */
export class BankExportPreparationLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "accounting.bank_export.lock_outside_transaction",
      "Le verrou de préparation d'un export bancaire exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/**
 * `pg_advisory_xact_lock`, relâché au `COMMIT` ou au `ROLLBACK`. Les comptes
 * se verrouillent sur TOUT l'abonnement, pas par entité : « déjà connu / en
 * vol » se lit sur tout l'annuaire CENET (R7, `fingerprints.all()`), et deux
 * entités qui partagent un IBAN le prendraient sinon toutes deux (décidé le
 * 2026-10-24). Les mandats restent par entité : leur sélection l'est.
 */
@Injectable()
export class PrismaBankExportPreparationLock extends BankExportPreparationLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async acquire(legalEntityId: string, kind: BankExportKind): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new BankExportPreparationLockOutsideTransactionError();
    }
    const key =
      kind === "accounts"
        ? `${LOCK_NAMESPACE}${kind}`
        : `${LOCK_NAMESPACE}${kind}:${legalEntityId}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}
