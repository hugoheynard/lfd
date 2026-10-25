import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { PackingSettings } from "../domain/entities/packing-settings.js";
import { PackingSettingsRepository } from "../domain/ports/packing-settings.repository.js";
import { PACKING_SETTINGS_KEY } from "./packing-settings.key.js";

/** Adaptateur Prisma de l'écriture des réglages du colisage : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaPackingSettingsRepository extends PackingSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async save(settings: PackingSettings, at: Date, staffUserId: string): Promise<void> {
    const row = { halfSharing: settings.halfSharing, updatedAt: at, updatedBy: staffUserId };
    await this.prisma.packingSettings.upsert({
      where: { key: PACKING_SETTINGS_KEY },
      create: { key: PACKING_SETTINGS_KEY, ...row },
      update: row,
    });
  }
}
