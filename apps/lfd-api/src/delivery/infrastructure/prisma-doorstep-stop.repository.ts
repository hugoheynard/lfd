import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DoorstepStop } from "../domain/entities/doorstep-stop.js";
import { DoorstepStopRepository } from "../domain/ports/doorstep-stop.repository.js";

/**
 * **Adaptateur Prisma de l'arrêt à la porte** (`plan-a-la-porte.md`, AP-D6).
 *
 * Il LIT l'arrêt, sa tournée et son exécution ; il n'ÉCRIT que `arrived_at`
 * de `delivery_stop_execution` — l'exécution, jamais la tournée (C10).
 *
 * 🔴 **Le mur est dans la requête** : `driver_staff_id` de la tournée entre
 * dans le `where` de l'arrêt, comme dans `PrismaDriverRoundsReader`.
 *
 * Une tournée partie dont l'arrêt n'a pas d'exécution — partie avant que le
 * départ ne fige quoi que ce soit (lot 4) — est lue comme au dépôt : il n'y
 * a nulle part où écrire l'arrivée, et l'écrire ailleurs serait inventer.
 */
@Injectable()
export class PrismaDoorstepStopRepository extends DoorstepStopRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async loadForDriver(
    roundId: string,
    stopId: string,
    staffUserId: string,
  ): Promise<DoorstepStop | null> {
    const row = await this.prisma.deliveryRoundStop.findFirst({
      where: { id: stopId, roundId, removedAt: null, round: { driverStaffId: staffUserId } },
      select: {
        id: true,
        orderId: true,
        closedAt: true,
        round: {
          select: {
            id: true,
            vehicleName: true,
            serviceDay: true,
            passage: true,
            departedAt: true,
            returnedAt: true,
          },
        },
        execution: { select: { reference: true, arrivedAt: true } },
      },
    });
    if (row === null) {
      return null;
    }
    return DoorstepStop.restore({
      stopId: row.id,
      orderId: row.orderId,
      round: {
        roundId: row.round.id,
        vehicleName: row.round.vehicleName,
        serviceDay: row.round.serviceDay,
        passage: row.round.passage,
      },
      departedAt: row.execution === null ? null : row.round.departedAt,
      returnedAt: row.round.returnedAt,
      reference: row.execution?.reference ?? "",
      closedAt: row.closedAt,
      arrivedAt: row.execution?.arrivedAt ?? null,
    });
  }

  /** `arrived_at IS NULL` dans le `where` : deux arrivées simultanées gardent la première. */
  async save(stop: DoorstepStop): Promise<void> {
    if (stop.arrivedAt === null) {
      return;
    }
    await this.prisma.deliveryStopExecution.updateMany({
      where: { stopId: stop.stopId, arrivedAt: null },
      data: { arrivedAt: stop.arrivedAt },
    });
  }
}
