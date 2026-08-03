import { Injectable } from "@nestjs/common";
import type { PlatformSettings } from "@lfd/contracts";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { PlatformSettingsRepository } from "../domain/platform-settings.repository.js";

/** Id fixe de l'unique ligne de config (singleton). */
const SINGLETON = "singleton";

/**
 * Lecture/écriture de la config plateforme sur l'unique ligne
 * `b2b_platform_settings`. `read` **upsert** la ligne aux défauts si elle manque —
 * la table est vide juste après la migration, la première lecture la matérialise.
 */
@Injectable()
export class PrismaPlatformSettingsRepository extends PlatformSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(): Promise<PlatformSettings> {
    const row = await this.prisma.platformSettings.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON },
      update: {},
    });
    return {
      tva: row.tvaMode,
      kbis: row.kbisMode,
      billing: row.billingMode,
      delivery: row.deliveryMode,
    };
  }

  async save(settings: PlatformSettings): Promise<void> {
    const modes = {
      tvaMode: settings.tva,
      kbisMode: settings.kbis,
      billingMode: settings.billing,
      deliveryMode: settings.delivery,
    };
    await this.prisma.platformSettings.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, ...modes },
      update: modes,
    });
  }
}
