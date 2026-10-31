import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { currentTransaction } from "../../../platform/database/transaction.store.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import { DeliveryZoneLock } from "../domain/ports/delivery-zone-lock.js";

/** Demandé hors transaction : relâché aussitôt, il ne protégerait rien. */
export class DeliveryZoneLockOutsideTransactionError extends TechnicalError {
  constructor() {
    super(
      "delivery_zone.lock_outside_transaction",
      "Le verrou d'une zone de livraison exige une transaction ouverte : appeler ce port sous UnitOfWork.run.",
    );
  }
}

/** `SELECT … FOR UPDATE` sur la ligne de la zone. */
@Injectable()
export class PrismaDeliveryZoneLock extends DeliveryZoneLock {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lock(zoneId: string): Promise<void> {
    if (currentTransaction() === undefined) {
      throw new DeliveryZoneLockOutsideTransactionError();
    }
    await this.prisma.$queryRaw`
      SELECT "id" FROM "public"."delivery_zones" WHERE "id" = ${zoneId} FOR UPDATE`;
  }
}
