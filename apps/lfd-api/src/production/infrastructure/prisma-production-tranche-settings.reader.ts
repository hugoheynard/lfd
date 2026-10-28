import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ProductionTrancheSettings } from "../domain/entities/production-tranche-settings.js";
import { ProductionTrancheSettingsReader } from "../domain/ports/production-tranche-settings.reader.js";
import { PRODUCTION_TRANCHE_SETTINGS_KEY } from "./production-tranche-settings.key.js";

/** Adaptateur Prisma de la lecture des tranches : la ligne relue repasse par l'agrégat. */
@Injectable()
export class PrismaProductionTrancheSettingsReader extends ProductionTrancheSettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<ProductionTrancheSettings | null> {
    const row = await this.prisma.productionTrancheSettings.findUnique({
      where: { key: PRODUCTION_TRANCHE_SETTINGS_KEY },
      select: { mode: true, fixedTranches: true },
    });
    return row === null ? null : ProductionTrancheSettings.set(row.mode, row.fixedTranches);
  }
}
