import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { OrderInvoicingLock } from "../domain/ports/order-invoicing-lock.js";

export class OrderInvoicingLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "accounting.card_invoice.lock_outside_transaction",
      "Le verrou de facturation d'une commande exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/**
 * `SELECT … FOR UPDATE` sur la ligne de la commande — le même verrou que le
 * carnet des remboursements (`PrismaOrderRefundRepository`) : un remboursement
 * constaté et une facture émise sur la même commande s'attendent l'un l'autre.
 */
@Injectable()
export class PrismaOrderInvoicingLock extends OrderInvoicingLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(orderId: string): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new OrderInvoicingLockOutsideTransactionError();
    }
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."orders" WHERE "id" = ${orderId} FOR UPDATE`;
  }
}
