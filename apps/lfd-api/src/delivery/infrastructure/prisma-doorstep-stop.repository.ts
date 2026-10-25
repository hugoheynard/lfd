import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { DoorstepStop } from "../domain/entities/doorstep-stop.js";
import { DoorstepStopRepository } from "../domain/ports/doorstep-stop.repository.js";
import { outcomeOf } from "./stop-decision.mapper.js";
import { TransferStopNotAnOrderError } from "../domain/errors/delivery-round-errors.js";

/**
 * **Adaptateur Prisma de l'arrêt à la porte** (`a-la-porte.md`, AP-D6).
 *
 * Il LIT l'arrêt, sa tournée, son exécution et la décision vivante du
 * commercial (B3) ; il n'écrit rien. `arrived_at` reste en base, plus
 * écrit depuis le retrait de « Je suis arrivé » (2026-10-25, décision de Hugo).
 *
 * 🔴 **Le mur est dans la requête** : `driver_staff_id` de la tournée entre
 * dans le `where` de l'arrêt, comme dans `PrismaDriverRoundsReader`.
 *
 * Une tournée partie dont l'arrêt n'a pas d'exécution — partie avant que le
 * départ ne fige quoi que ce soit (lot 4) — est lue comme au dépôt : il n'y
 * a pas d'instantané à lire, et le lire ailleurs serait inventer.
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
        execution: {
          select: {
            reference: true,
            signatureRequired: true,
            depositAllowed: true,
          },
        },
      },
    });
    if (row === null) {
      return null;
    }
    // Un arrêt de transfert n'a aucun geste de la porte (plan du transfert
    // interne, §5) : son seul geste est « Remis au site » (T2).
    if (row.orderId === null) {
      throw new TransferStopNotAnOrderError();
    }
    const orderId = row.orderId;
    // Lue APRÈS la ligne murée, et seulement pour elle : la décision d'un
    // arrêt qui n'est pas au livreur n'est jamais lue ici.
    const decision = await this.prisma.deliveryStopDecision.findUnique({
      where: { stopId: row.id },
      select: { outcome: true },
    });
    return DoorstepStop.restore({
      stopId: row.id,
      orderId,
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
      signatureRequired: row.execution?.signatureRequired ?? false,
      depositAllowed: row.execution?.depositAllowed ?? false,
      decision: decision === null ? null : (outcomeOf(decision.outcome) ?? "pending"),
    });
  }
}
