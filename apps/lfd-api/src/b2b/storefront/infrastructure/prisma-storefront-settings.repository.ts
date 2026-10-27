import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  allergenDisplayOf,
  DEFAULT_ALLERGEN_DISPLAY,
  type AllergenDisplay,
} from "../domain/allergen-display.js";
import { StorefrontSettingsRepository } from "../domain/storefront-settings.repository.js";
import { STOREFRONT_ID } from "../domain/storefront.events.js";

/**
 * Adaptateur Prisma des réglages globaux de la vitrine. La ligne est lue
 * `FOR UPDATE` dans la transaction ambiante : la valeur d'avant, que la trace
 * cite, est celle que l'écriture remplace.
 */
@Injectable()
export class PrismaStorefrontSettingsRepository extends StorefrontSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async setAllergenDisplay(
    value: AllergenDisplay,
    at: Date,
    staffId: string,
  ): Promise<AllergenDisplay> {
    const rows = await this.prisma.$queryRaw<{ allergen_display: string }[]>`
      SELECT "allergen_display" FROM "public"."storefront_settings"
      WHERE "id" = ${STOREFRONT_ID} FOR UPDATE`;
    const before = rows[0];
    await this.prisma.storefrontSettings.upsert({
      where: { id: STOREFRONT_ID },
      create: {
        id: STOREFRONT_ID,
        allergenDisplay: value,
        updatedAt: at,
        updatedByStaffId: staffId,
      },
      update: { allergenDisplay: value, updatedAt: at, updatedByStaffId: staffId },
    });
    return before === undefined
      ? DEFAULT_ALLERGEN_DISPLAY
      : allergenDisplayOf(before.allergen_display);
  }
}
