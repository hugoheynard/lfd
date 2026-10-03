import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  ActiveBinTypesReader,
  MeasuredVehiclesReader,
} from "../domain/ports/composition-prerequisites.readers.js";

/**
 * « Mesuré » = les trois cotes utiles posées, comme `cargoOfRow` le lit : une
 * cote manquante vaut des dimensions inconnues.
 */
@Injectable()
export class PrismaMeasuredVehiclesReader extends MeasuredVehiclesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async measuredIds(): Promise<readonly string[]> {
    const rows = await this.prisma.deliveryVehicle.findMany({
      where: {
        retiredAt: null,
        cargoLengthCm: { not: null },
        cargoWidthCm: { not: null },
        cargoHeightCm: { not: null },
      },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}

@Injectable()
export class PrismaActiveBinTypesReader extends ActiveBinTypesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async activeIds(): Promise<readonly string[]> {
    const rows = await this.prisma.deliveryBinType.findMany({
      where: { archivedAt: null },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }
}
