import { Injectable } from "@nestjs/common";

import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { ClientNotebookLock } from "../domain/ports/client-notebook.lock.js";

/** Espace de noms de la clé : deux verrous consultatifs d'usages différents ne se croisent pas. */
const LOCK_NAMESPACE = "client-notes.notebook:";

/**
 * Le verrou a été demandé hors d'une unité de travail. Faute de câblage : émis
 * en autocommit, il serait relâché à la fin de sa propre instruction, et deux
 * enregistrements pourraient s'effacer l'un l'autre en silence.
 */
export class ClientNotebookLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "client_notes.notebook.lock_outside_transaction",
      "Le verrou du carnet de notes exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/**
 * Adaptateur Postgres du verrou de carnet — calqué sur
 * `PrismaDeliveryProcedureLock`, et pour la même raison.
 *
 * `pg_advisory_xact_lock` plutôt qu'un `SELECT … FOR UPDATE` sur la racine : le
 * carnet n'existe pas encore à la première note, et ce sont précisément deux
 * premières notes simultanées qu'il faut aussi mettre en file. Relâché au
 * `COMMIT` ou au `ROLLBACK`.
 */
@Injectable()
export class PrismaClientNotebookLock extends ClientNotebookLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async acquire(companyId: string): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new ClientNotebookLockOutsideTransactionError();
    }
    const key = `${LOCK_NAMESPACE}${companyId}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}
