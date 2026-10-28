import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { ProductionTrancheSettings } from "../domain/entities/production-tranche-settings.js";
import {
  ProductionTrancheSettingsRepository,
  type TrancheSettingsAuthor,
} from "../domain/ports/production-tranche-settings.repository.js";
import { PRODUCTION_TRANCHE_SETTINGS_KEY } from "./production-tranche-settings.key.js";

/** Adaptateur Prisma de l'écriture des tranches : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaProductionTrancheSettingsRepository extends ProductionTrancheSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(
    settings: ProductionTrancheSettings,
    at: Date,
    author: TrancheSettingsAuthor,
  ): Promise<void> {
    const row = {
      mode: settings.mode,
      fixedTranches: [...settings.fixedTranches],
      updatedAt: at,
      updatedByStaffId: author.staffUserId,
      updatedByName: author.name,
    };
    await this.prisma.productionTrancheSettings.upsert({
      where: { key: PRODUCTION_TRANCHE_SETTINGS_KEY },
      create: { key: PRODUCTION_TRANCHE_SETTINGS_KEY, ...row },
      update: row,
    });
  }
}
