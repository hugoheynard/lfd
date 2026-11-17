import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { TrancheSettingsAuthor } from "../../day/index.js";
import { ProductionTrackingSettings } from "../domain/entities/production-tracking-settings.js";
import {
  ProductionTrackingSettingsReader,
  ProductionTrackingSettingsRepository,
  ProductionTrackingSettingsVersion,
} from "../domain/ports/production-tracking-settings.ports.js";
import { trackingLevelFrom } from "./tracking-level-column.js";

/** La clé naturelle de l'unique ligne du niveau de suivi (CHECK en base). */
const PRODUCTION_TRACKING_SETTINGS_KEY = "house";

/** Adaptateur Prisma de la lecture du niveau de suivi du fournil. */
@Injectable()
export class PrismaProductionTrackingSettingsReader extends ProductionTrackingSettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<ProductionTrackingSettings | null> {
    const row = await this.prisma.productionTrackingSettings.findUnique({
      where: { key: PRODUCTION_TRACKING_SETTINGS_KEY },
      select: { level: true, marginMinutes: true },
    });
    return row === null
      ? null
      : ProductionTrackingSettings.of({
          level: trackingLevelFrom(row.level, "production_tracking_settings"),
          marginMinutes: row.marginMinutes,
        });
  }
}

/** Adaptateur Prisma de l'écriture du niveau de suivi : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaProductionTrackingSettingsRepository extends ProductionTrackingSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(
    settings: ProductionTrackingSettings,
    at: Date,
    author: TrancheSettingsAuthor,
  ): Promise<void> {
    const row = {
      level: settings.level,
      marginMinutes: settings.marginMinutes,
      updatedAt: at,
      updatedByStaffId: author.staffUserId,
      updatedByName: author.name,
    };
    await this.prisma.productionTrackingSettings.upsert({
      where: { key: PRODUCTION_TRACKING_SETTINGS_KEY },
      create: { key: PRODUCTION_TRACKING_SETTINGS_KEY, ...row },
      update: row,
    });
  }
}

/** Le numéro du niveau de suivi : l'instant de sa dernière pose, lu sur sa seule ligne. */
@Injectable()
export class PrismaProductionTrackingSettingsVersion extends ProductionTrackingSettingsVersion {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async versionOf(): Promise<number> {
    const row = await this.prisma.productionTrackingSettings.findUnique({
      where: { key: PRODUCTION_TRACKING_SETTINGS_KEY },
      select: { updatedAt: true },
    });
    return row?.updatedAt.getTime() ?? 0;
  }
}
