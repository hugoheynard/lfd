import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { SitePrincipalLock, type LockedPrincipal } from "../domain/ports/site-principal.lock.js";

/**
 * `SELECT … FOR UPDATE` sur la ligne du site, dans la transaction ambiante :
 * `PrismaService` y est routé par `transactionalPrisma` dès qu'une
 * `UnitOfWork` est ouverte. Hors transaction, le verrou serait relâché à la
 * fin de sa propre requête et ne rangerait rien — d'où le refus.
 *
 * Le carnet d'adresses prend déjà ce verrou en sauvant
 * (`prisma-company-address.repository.ts`) : le reprendre dans la même
 * transaction ne coûte rien.
 */
@Injectable()
export class PrismaSitePrincipalLock extends SitePrincipalLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lockedPrincipalOf(companyId: string): Promise<LockedPrincipal | null> {
    if (currentTransaction() === undefined) {
      throw new SitePrincipalLockOutsideTransactionError();
    }
    const rows = await this.prisma.$queryRaw<{ parent_company_id: string | null }[]>`
      SELECT parent_company_id FROM companies WHERE id = ${companyId} FOR UPDATE`;
    const [row] = rows;
    return row === undefined ? null : { principalCompanyId: row.parent_company_id };
  }
}

/** Faute de code : le verrou du principal n'a de sens que dans une transaction. */
export class SitePrincipalLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "account.site_principal_lock.outside_transaction",
      "Le principal d'un site a été lu hors d'une unité de travail : son verrou n'aurait rien " +
        "protégé. Le geste est refusé ; l'appel doit se faire dans le même `uow.run` que l'écriture.",
    );
  }
}
