import { Injectable } from "@nestjs/common";
import {
  type BillingAddressPayload,
  billingAddressPayloadSchema,
  type PlatformSettings,
} from "@lfd/contracts";

import { Prisma } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import { PlatformSettingsRepository } from "../domain/platform-settings.repository.js";

/** Id fixe de l'unique ligne de config (singleton). */
const SINGLETON = "singleton";

/**
 * Lecture/écriture de la config plateforme sur l'unique ligne
 * `b2b_platform_settings`. `read` **upsert** la ligne aux défauts si elle manque —
 * la table est vide juste après la migration, la première lecture la matérialise.
 *
 * L'adresse de retrait est stockée en **JSON** : on la **valide** (schéma postal)
 * à la lecture — jamais d'assertion de type sur une valeur venue de la base.
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
      pickupAddress: parsePickup(row.pickupAddress),
    };
  }

  async save(settings: PlatformSettings): Promise<void> {
    const data = {
      tvaMode: settings.tva,
      kbisMode: settings.kbis,
      billingMode: settings.billing,
      deliveryMode: settings.delivery,
      // `null` → SQL NULL (DbNull), pas un JSON `null` ; un objet → stocké tel quel.
      pickupAddress: settings.pickupAddress ?? Prisma.DbNull,
    };
    await this.prisma.platformSettings.upsert({
      where: { id: SINGLETON },
      create: { id: SINGLETON, ...data },
      update: data,
    });
  }
}

/** Valide le JSON stocké vers l'adresse de retrait, ou `null` si absent. */
function parsePickup(value: Prisma.JsonValue | null): BillingAddressPayload | null {
  if (value === null) {
    return null;
  }
  return billingAddressPayloadSchema.parse(value);
}
