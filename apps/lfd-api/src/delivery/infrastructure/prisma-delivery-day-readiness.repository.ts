import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { currentTransaction } from "../../platform/database/transaction.store.js";
import { TechnicalError } from "../../platform/shared/errors/app-error.js";
import { ShipmentRef } from "../../production/channels/delivery/index.js";
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
 *
 * Les envois vivent dans la table fille `delivery_day_readiness_shipment`
 * (plan E7 reliquat, L3c) ; `delivery_order_ids` n'est plus ni lue ni écrite.
 * `save` rend la table fille égale à l'ensemble de l'agrégat : il ne fait que
 * grandir, sauf la réouverture, qui l'oublie — et c'est alors un ensemble
 * qu'on vide, pas un agrégat qu'on supprime.
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
    const row = await this.prisma.deliveryDayReadiness.findUnique({
      where: { serviceDay },
      select: {
        serviceDay: true,
        closedAt: true,
        createdAt: true,
        updatedAt: true,
        shipments: { select: { orderId: true, rank: true } },
      },
    });
    return row === null
      ? null
      : DeliveryDayReadiness.restore({
          ...row,
          shipments: row.shipments.map((shipment) =>
            ShipmentRef.of(shipment.orderId, shipment.rank),
          ),
        });
  }

  async save(readiness: DeliveryDayReadiness): Promise<void> {
    const serviceDay = readiness.serviceDay;
    const row = { closedAt: readiness.closedAt, updatedAt: readiness.updatedAt };
    await this.prisma.deliveryDayReadiness.upsert({
      where: { serviceDay },
      create: { serviceDay, createdAt: readiness.createdAt, ...row },
      update: row,
    });
    const shipments = readiness.shipments.map((shipment) => ({
      orderId: shipment.orderId,
      rank: shipment.rank,
    }));
    // `OR: []` ne retient rien : un ensemble oublié vide la table fille.
    await this.prisma.deliveryDayReadinessShipment.deleteMany({
      where: { serviceDay, NOT: { OR: shipments } },
    });
    await this.prisma.deliveryDayReadinessShipment.createMany({
      data: shipments.map((shipment) => ({ serviceDay, ...shipment })),
      skipDuplicates: true,
    });
  }
}
