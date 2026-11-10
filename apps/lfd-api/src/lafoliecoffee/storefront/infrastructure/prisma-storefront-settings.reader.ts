import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  allergenDisplayOf,
  DEFAULT_ALLERGEN_DISPLAY,
  type AllergenDisplaySetting,
} from "../domain/allergen-display.js";
import { StorefrontSettingsReader } from "../domain/storefront-settings.reader.js";
import { STOREFRONT_ID } from "../domain/storefront.events.js";

/** Lecture des réglages globaux de la vitrine — une ligne, ou le défaut. */
@Injectable()
export class PrismaStorefrontSettingsReader extends StorefrontSettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async allergenDisplay(): Promise<AllergenDisplaySetting> {
    const row = await this.prisma.storefrontSettings.findUnique({
      where: { id: STOREFRONT_ID },
      select: { allergenDisplay: true, updatedAt: true },
    });
    return row === null
      ? { allergenDisplay: DEFAULT_ALLERGEN_DISPLAY, updatedAt: null }
      : { allergenDisplay: allergenDisplayOf(row.allergenDisplay), updatedAt: row.updatedAt };
  }
}
