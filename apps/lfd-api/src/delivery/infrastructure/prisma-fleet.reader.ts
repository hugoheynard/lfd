import type { VehicleView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { CargoSpace } from "../domain/value-objects/cargo-space.js";
import { FleetReader } from "../domain/ports/fleet.reader.js";
import { vehicleGaps } from "../domain/services/vehicle-gaps.js";
import { vehicleEnergyOf } from "../domain/value-objects/vehicle-energy.js";
import {
  cargoOfRow,
  refrigerationOfRow,
  wheelArchesOfRow,
} from "./delivery-vehicle-load.mapper.js";

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
    return rows.map((row) => {
      const cargo = cargoOfRow(row);
      const wheelArches = wheelArchesOfRow(row);
      return {
        id: row.id,
        name: row.name,
        plate: row.plate,
        retiredAt: row.retiredAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        // Le volume se dérive par le value object : une seule formule, celle du domaine.
        cargo:
          cargo === null ? null : { ...cargo, volumeLiters: CargoSpace.of(cargo).volumeLiters },
        wheelArches,
        refrigeration: refrigerationOfRow(row),
        energy: row.energy === null ? null : vehicleEnergyOf(row.energy),
        allowedZoneIds: row.allowedZoneIds,
        gaps: vehicleGaps({ name: row.name, plate: row.plate, cargo, wheelArches }),
      };
    });
  }
}
