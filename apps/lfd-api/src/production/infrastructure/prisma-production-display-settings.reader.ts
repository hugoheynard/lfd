import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { ProductionDisplaySettings } from "../domain/entities/production-display-settings.js";
import { ProductionDisplaySettingsReader } from "../domain/ports/production-display-settings.reader.js";
import { PRODUCTION_DISPLAY_SETTINGS_KEY } from "./production-display-settings.key.js";

/** Adaptateur Prisma de la lecture du rangement du fournil. */
@Injectable()
export class PrismaProductionDisplaySettingsReader extends ProductionDisplaySettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<ProductionDisplaySettings | null> {
    const row = await this.prisma.productionDisplaySettings.findUnique({
      where: { key: PRODUCTION_DISPLAY_SETTINGS_KEY },
      select: { showSubcategories: true },
    });
    return row === null ? null : ProductionDisplaySettings.of(row);
  }
}
