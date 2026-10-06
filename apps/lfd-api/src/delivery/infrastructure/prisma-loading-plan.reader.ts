import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import {
  LoadingPlanReader,
  type RoundVehicleLoadRow,
} from "../domain/ports/loading-plan.reader.js";
import type { PlanBinType } from "../domain/services/loading-plan.js";
import {
  cargoOfRow,
  refrigerationOfRow,
  wheelArchesOfRow,
} from "./delivery-vehicle-load.mapper.js";

/** Adaptateur Prisma de la lecture du plan de chargement. N'écrit rien. */
@Injectable()
export class PrismaLoadingPlanReader extends LoadingPlanReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async vehicleLoadOf(roundId: string): Promise<RoundVehicleLoadRow | null> {
    const round = await this.prisma.deliveryRound.findUnique({
      where: { id: roundId },
      select: { vehicle: true },
    });
    if (round === null) {
      return null;
    }
    return {
      cargo: cargoOfRow(round.vehicle),
      wheelArches: wheelArchesOfRow(round.vehicle),
      refrigeratedLiters: refrigerationOfRow(round.vehicle)?.volumeLiters ?? null,
    };
  }

  async binTypes(ids: readonly string[]): Promise<ReadonlyMap<string, PlanBinType>> {
    if (ids.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.deliveryBinType.findMany({
      where: { id: { in: [...ids] } },
      select: {
        id: true,
        name: true,
        isotherm: true,
        outerLengthMm: true,
        outerWidthMm: true,
        outerHeightMm: true,
        maxStack: true,
      },
    });
    return new Map(rows.map((row) => [row.id, { ...row }]));
  }
}
