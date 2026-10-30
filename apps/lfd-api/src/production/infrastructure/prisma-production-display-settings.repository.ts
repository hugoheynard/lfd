import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { ProductionDisplaySettings } from "../domain/entities/production-display-settings.js";
import { ProductionDisplaySettingsRepository } from "../domain/ports/production-display-settings.repository.js";
import type { TrancheSettingsAuthor } from "../domain/ports/production-tranche-settings.repository.js";
import { PRODUCTION_DISPLAY_SETTINGS_KEY } from "./production-display-settings.key.js";

/** Adaptateur Prisma de l'écriture du rangement du fournil : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaProductionDisplaySettingsRepository extends ProductionDisplaySettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(
    settings: ProductionDisplaySettings,
    at: Date,
    author: TrancheSettingsAuthor,
  ): Promise<void> {
    const row = {
      showSubcategories: settings.showSubcategories,
      updatedAt: at,
      updatedByStaffId: author.staffUserId,
      updatedByName: author.name,
    };
    await this.prisma.productionDisplaySettings.upsert({
      where: { key: PRODUCTION_DISPLAY_SETTINGS_KEY },
      create: { key: PRODUCTION_DISPLAY_SETTINGS_KEY, ...row },
      update: row,
    });
  }
}
