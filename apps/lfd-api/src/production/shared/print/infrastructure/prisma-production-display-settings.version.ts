import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../../platform/database/prisma.service.js";
import { ProductionDisplaySettingsVersion } from "../domain/ports/production-display-settings-version.js";
import { PRODUCTION_DISPLAY_SETTINGS_KEY } from "./production-display-settings.key.js";

/** Le numéro du réglage d'affichage : l'instant de sa dernière pose, lu sur sa seule ligne. */
@Injectable()
export class PrismaProductionDisplaySettingsVersion extends ProductionDisplaySettingsVersion {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionOf(): Promise<number> {
    const row = await this.prisma.productionDisplaySettings.findUnique({
      where: { key: PRODUCTION_DISPLAY_SETTINGS_KEY },
      select: { updatedAt: true },
    });
    return row?.updatedAt.getTime() ?? 0;
  }
}
