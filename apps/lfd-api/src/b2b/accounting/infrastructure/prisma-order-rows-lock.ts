import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { OrderRowsLock } from "../domain/ports/order-rows-lock.js";

export class OrderRowsLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "accounting.order_rows_lock.outside_transaction",
      "Le verrou des commandes exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/**
 * `SELECT … FOR UPDATE` sur des lignes `orders`, **dans l'ordre binaire** de
 * leur identifiant : Postgres verrouille dans l'ordre de sortie du tri, et
 * `COLLATE "C"` rend ce tri indépendant de la collation de la base (les bases
 * de dev et de test sont en `en_US.utf8`, lu le 2026-10-12 dans
 * `pg_database`). Le même verrou de ligne que `PrismaOrderInvoicingLock` :
 * une annulation et une émission sur la même commande s'attendent.
 */
@Injectable()
export class PrismaOrderRowsLock extends OrderRowsLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lockAll(orderIds: readonly string[]): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new OrderRowsLockOutsideTransactionError();
    }
    if (orderIds.length === 0) {
      return;
    }
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."orders"
      WHERE "id" = ANY(${[...orderIds]}::text[])
      ORDER BY "id" COLLATE "C"
      FOR UPDATE`;
  }
}
