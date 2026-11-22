import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { CompanyRowLock } from "../domain/ports/company-row.lock.js";

/**
 * `SELECT … FOR UPDATE` sur la ligne de la société, dans la transaction
 * ambiante. Hors transaction, le verrou serait relâché à la fin de sa propre
 * requête et ne rangerait rien — d'où le refus.
 */
@Injectable()
export class PrismaCompanyRowLock extends CompanyRowLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(companyId: string): Promise<boolean> {
    if (currentTransaction() === undefined) {
      throw new CompanyRowLockOutsideTransactionError();
    }
    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`;
    return rows.length > 0;
  }
}

/** Faute de code : le verrou d'une société n'a de sens que dans une transaction. */
export class CompanyRowLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "account.company_row_lock.outside_transaction",
      "La ligne d'une société a été verrouillée hors d'une unité de travail : le verrou n'aurait " +
        "rien protégé. Le geste est refusé ; l'appel doit se faire dans le même `uow.run` que l'écriture.",
    );
  }
}
