import { Injectable } from "@nestjs/common";

import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { PersonAttachmentLock } from "../domain/ports/person-attachment.lock.js";

/** Espace de noms de la clé de verrou : deux verrous consultatifs d'usages différents ne se croisent pas. */
const LOCK_NAMESPACE = "account.person-attachment:";

/**
 * Le verrou a été demandé hors d'une unité de travail.
 *
 * Une faute de câblage, pas un cas métier : un `pg_advisory_xact_lock` émis en
 * autocommit est relâché à la fin de sa propre instruction, et la vérification
 * qui le suit ne serait plus protégée par rien. On refuse bruyamment plutôt que
 * de laisser passer deux sociétés en silence.
 */
export class AttachmentLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "account.person_attachment.lock_outside_transaction",
      "Le verrou de rattachement exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/**
 * Adaptateur Postgres du verrou de rattachement.
 *
 * `pg_advisory_xact_lock` plutôt qu'un `SELECT … FOR UPDATE` sur la ligne
 * `users` : il ne bloque aucune autre écriture de la personne (profil,
 * préférences, connexion qui recopie une preuve), seulement les chemins qui
 * prennent le même verrou. Il est relâché au `COMMIT` ou au `ROLLBACK`, jamais
 * oublié.
 *
 * Le client injecté est le proxy `transactionalPrisma` : `$executeRaw` et
 * `membership.count` visent donc la transaction ambiante.
 */
@Injectable()
export class PrismaPersonAttachmentLock extends PersonAttachmentLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async acquireAndCheckAttached(userId: string): Promise<boolean> {
    if (currentTransaction() === undefined) {
      throw new AttachmentLockOutsideTransactionError();
    }
    const key = `${LOCK_NAMESPACE}${userId}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    // Lu APRÈS le verrou : en READ COMMITTED, chaque instruction voit ce que la
    // requête concurrente a commité pendant qu'on attendait.
    const attachments = await this.prisma.membership.count({ where: { userId } });
    return attachments > 0;
  }
}
