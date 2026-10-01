import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  type UndeliveredStopRow,
  UndeliveredStopsReader,
} from "../domain/ports/undelivered-stops.reader.js";

/**
 * **Adaptateur Prisma de « Non remis »** (`plan-a-la-porte.md`, AP-D7). Il ne
 * lit que les tables de la livraison : l'arrêt, sa tournée, et ce que le
 * départ a figé (numéro, client, arrivée). Aucune lecture du commerce.
 *
 * Le critère : arrêt ni retiré ni clos, tournée PARTIE, et — RENTRÉE (PL2),
 * ou d'une journée strictement antérieure à `today` (des clés `AAAA-MM-JJ`,
 * comparées entre elles).
 */
@Injectable()
export class PrismaUndeliveredStopsReader extends UndeliveredStopsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async undelivered(today: string): Promise<readonly UndeliveredStopRow[]> {
    const rows = await this.prisma.deliveryRoundStop.findMany({
      where: {
        removedAt: null,
        closedAt: null,
        round: { departedAt: { not: null } },
        OR: [{ round: { returnedAt: { not: null } } }, { serviceDay: { lt: today } }],
      },
      orderBy: [{ serviceDay: "asc" }, { roundId: "asc" }, { position: "asc" }],
      select: {
        id: true,
        orderId: true,
        serviceDay: true,
        round: {
          select: {
            id: true,
            vehicleName: true,
            passage: true,
            departedAt: true,
            returnedAt: true,
          },
        },
        execution: {
          select: { reference: true, customerLabel: true, arrivedAt: true, departedAt: true },
        },
      },
    });
    return rows.flatMap((row) => {
      // Le filtre garantit le départ ; l'exécution le porte aussi, figé.
      const departedAt = row.execution?.departedAt ?? row.round.departedAt;
      return departedAt === null
        ? []
        : [
            {
              roundId: row.round.id,
              vehicleName: row.round.vehicleName,
              passage: row.round.passage,
              serviceDay: row.serviceDay,
              stopId: row.id,
              orderId: row.orderId,
              reference: row.execution?.reference ?? "",
              customerLabel: row.execution?.customerLabel ?? "",
              departedAt,
              returnedAt: row.round.returnedAt,
              arrivedAt: row.execution?.arrivedAt ?? null,
            },
          ];
    });
  }
}
