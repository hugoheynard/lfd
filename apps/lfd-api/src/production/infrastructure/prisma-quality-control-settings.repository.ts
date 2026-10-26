import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { QualityControlSettings } from "../domain/entities/quality-control-settings.js";
import { QualityControlSettingsRepository } from "../domain/ports/quality-control-settings.repository.js";
import { QUALITY_CONTROL_SETTINGS_KEY } from "./quality-control-settings.key.js";

/** Adaptateur Prisma de l'écriture des réglages du contrôle qualité : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaQualityControlSettingsRepository extends QualityControlSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(settings: QualityControlSettings, at: Date, staffUserId: string): Promise<void> {
    const row = {
      lineChecks: settings.lineChecks,
      orderChecks: settings.orderChecks,
      updatedAt: at,
      updatedBy: staffUserId,
    };
    await this.prisma.productionQualitySettings.upsert({
      where: { key: QUALITY_CONTROL_SETTINGS_KEY },
      create: { key: QUALITY_CONTROL_SETTINGS_KEY, ...row },
      update: row,
    });
  }
}
