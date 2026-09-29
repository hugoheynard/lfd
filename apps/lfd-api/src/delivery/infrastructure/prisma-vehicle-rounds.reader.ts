import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { VehicleRoundsReader } from "../domain/ports/vehicle-rounds.reader.js";

/** Adaptateur Prisma des tournées vivantes d'un véhicule, pour le refus de retrait (C14). */
@Injectable()
export class PrismaVehicleRoundsReader extends VehicleRoundsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async liveDaysAfter(vehicleId: string, afterDay: string): Promise<readonly string[]> {
    const rows = await this.prisma.deliveryRound.findMany({
      where: {
        vehicleId,
        // `AAAA-MM-JJ` : l'ordre des chaînes est celui des jours.
        serviceDay: { gt: afterDay },
        stops: { some: { removedAt: null, closedAt: null } },
      },
      distinct: ["serviceDay"],
      orderBy: { serviceDay: "asc" },
      select: { serviceDay: true },
    });
    return rows.map((row) => row.serviceDay);
  }
}
