import { DEFAULT_CONTACT_SETTINGS, type ContactSettingsView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ContactSettings } from "../domain/contact-settings.js";
import { ContactSettingsReader } from "../domain/ports/contact-settings.reader.js";
import { ContactSettingsRepository } from "../domain/ports/contact-settings.repository.js";
import { CONTACT_SETTINGS_KEY } from "./contact-settings.key.js";
import { cardsOf, columnsOf } from "./contact-settings.mapper.js";

/** Adaptateur Prisma de la lecture. **Ligne absente = tout vide** : la boutique garde ses textes. */
@Injectable()
export class PrismaContactSettingsReader extends ContactSettingsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<ContactSettingsView> {
    const row = await this.prisma.contactSettings.findUnique({
      where: { key: CONTACT_SETTINGS_KEY },
    });
    if (row === null) {
      return DEFAULT_CONTACT_SETTINGS;
    }
    return {
      cards: cardsOf(row),
      updatedAt: row.updatedAt.toISOString(),
      // Un agent que l'annuaire ne connaissait pas a été figé sans nom : on ne l'invente pas.
      updatedBy: row.updatedByName === "" ? null : row.updatedByName,
    };
  }
}

/** Adaptateur Prisma de l'écriture : un `upsert` sur la clé naturelle. */
@Injectable()
export class PrismaContactSettingsRepository extends ContactSettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(settings: ContactSettings): Promise<void> {
    const row = {
      ...columnsOf(settings.cards),
      updatedAt: settings.at,
      updatedByStaffId: settings.author.staffUserId,
      updatedByName: settings.author.name,
    };
    await this.prisma.contactSettings.upsert({
      where: { key: CONTACT_SETTINGS_KEY },
      create: { key: CONTACT_SETTINGS_KEY, ...row },
      update: row,
    });
  }
}
