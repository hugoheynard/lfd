import type { VehicleView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { FleetReader } from "../domain/ports/fleet.reader.js";

/** Adaptateur Prisma de la lecture de la flotte. */
@Injectable()
export class PrismaFleetReader extends FleetReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly VehicleView[]> {
    const rows = await this.prisma.deliveryVehicle.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      plate: row.plate,
      retiredAt: row.retiredAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }
}
