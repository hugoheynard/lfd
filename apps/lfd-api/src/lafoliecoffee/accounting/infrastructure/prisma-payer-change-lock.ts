import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { PayerChangeLock } from "../domain/ports/payer-change-lock.js";

export class PayerChangeLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "accounting.payer_change.lock_outside_transaction",
      "Le verrou des changements d'un payeur exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/**
 * `SELECT … FOR UPDATE` sur la ligne de la société payeuse (`companies`) :
 * un changement de mode et un changement de moyen du même payeur
 * s'attendent l'un l'autre.
 */
@Injectable()
export class PrismaPayerChangeLock extends PayerChangeLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(payerCompanyId: string): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new PayerChangeLockOutsideTransactionError();
    }
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."companies" WHERE "id" = ${payerCompanyId} FOR UPDATE`;
  }
}
