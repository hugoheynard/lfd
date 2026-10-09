import {
  DEFAULT_CONTACT_SETTINGS,
  type ContactCardText,
  type ContactSettingsView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { ContactSettings } from "../domain/contact-settings.js";
import { ContactSettingsReader } from "../domain/ports/contact-settings.reader.js";
import { ContactSettingsRepository } from "../domain/ports/contact-settings.repository.js";
import { CONTACT_SETTINGS_KEY } from "./contact-settings.key.js";

/** Les douze colonnes de texte, telles que la table les nomme. */
interface CardColumns {
  readonly b2bTitleFr: string;
  readonly b2bTitleEn: string;
  readonly b2bTitleIt: string;
  readonly b2bBodyFr: string;
  readonly b2bBodyEn: string;
  readonly b2bBodyIt: string;
  readonly b2cTitleFr: string;
  readonly b2cTitleEn: string;
  readonly b2cTitleIt: string;
  readonly b2cBodyFr: string;
  readonly b2cBodyEn: string;
  readonly b2cBodyIt: string;
}

function cardsOf(row: CardColumns): ContactSettingsView["cards"] {
  return {
    b2b: {
      title: { fr: row.b2bTitleFr, en: row.b2bTitleEn, it: row.b2bTitleIt },
      body: { fr: row.b2bBodyFr, en: row.b2bBodyEn, it: row.b2bBodyIt },
    },
    b2c: {
      title: { fr: row.b2cTitleFr, en: row.b2cTitleEn, it: row.b2cTitleIt },
      body: { fr: row.b2cBodyFr, en: row.b2cBodyEn, it: row.b2cBodyIt },
    },
  };
}

function columnsOf(b2b: ContactCardText, b2c: ContactCardText): CardColumns {
  return {
    b2bTitleFr: b2b.title.fr,
    b2bTitleEn: b2b.title.en,
    b2bTitleIt: b2b.title.it,
    b2bBodyFr: b2b.body.fr,
    b2bBodyEn: b2b.body.en,
    b2bBodyIt: b2b.body.it,
    b2cTitleFr: b2c.title.fr,
    b2cTitleEn: b2c.title.en,
    b2cTitleIt: b2c.title.it,
    b2cBodyFr: b2c.body.fr,
    b2cBodyEn: b2c.body.en,
    b2cBodyIt: b2c.body.it,
  };
}

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
      ...columnsOf(settings.cards.b2b, settings.cards.b2c),
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
