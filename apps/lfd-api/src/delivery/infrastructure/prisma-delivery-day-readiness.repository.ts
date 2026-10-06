import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { currentTransaction } from "../../platform/database/transaction.store.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import { DeliveryDayReadiness } from "../domain/entities/delivery-day-readiness.js";
import { DeliveryDayReadinessRepository } from "../domain/ports/delivery-day-readiness.repository.js";

/** L'espace de noms du verrou : aucune autre clé consultative ne le porte. */
const READINESS_LOCK_NAMESPACE = "delivery_day_readiness:";

/** Chargé hors d'une unité de travail : le verrou serait relâché aussitôt pris. */
class ReadinessLoadOutsideTransactionError extends TechnicalError {
  constructor(serviceDay: string) {
    super(
      "delivery.day_readiness.outside_transaction",
      `Le plan arrêté du ${serviceDay} a été chargé hors d'une unité de travail : son verrou ne tiendrait pas. Rien n'a été écrit ; signalez-le à l'équipe technique.`,
    );
  }
}

/**
 * Adaptateur Prisma du plan arrêté vu par la livraison.
 *
 * `load` prend d'abord `pg_advisory_xact_lock` sur la journée — il couvre
 * aussi une journée SANS ligne, que `FOR UPDATE` ne verrouillerait pas —,
 * tenu jusqu'au `COMMIT` de l'unité ouverte par la garde du relais. Le client
 * routé vise la transaction en cours.
 */
@Injectable()
export class PrismaDeliveryDayReadinessRepository extends DeliveryDayReadinessRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(serviceDay: string): Promise<DeliveryDayReadiness | null> {
    if (currentTransaction() === undefined) {
      throw new ReadinessLoadOutsideTransactionError(serviceDay);
    }
    const key = `${READINESS_LOCK_NAMESPACE}${serviceDay}`;
    await this.prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
    const row = await this.prisma.deliveryDayReadiness.findUnique({ where: { serviceDay } });
    return row === null ? null : DeliveryDayReadiness.restore(row);
  }

  async save(readiness: DeliveryDayReadiness): Promise<void> {
    const row = {
      closedAt: readiness.closedAt,
      deliveryOrderIds: [...readiness.deliveryOrderIds],
      updatedAt: readiness.updatedAt,
    };
    await this.prisma.deliveryDayReadiness.upsert({
      where: { serviceDay: readiness.serviceDay },
      create: { serviceDay: readiness.serviceDay, createdAt: readiness.createdAt, ...row },
      update: row,
    });
  }
}
