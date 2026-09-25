import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  AccountingSettingsReader,
  type AccountingSettings,
  type AccountingSettingsWrite,
  type AccountingSettingsWriter,
} from "../domain/ports/accounting-settings.store.js";

/** La clé de l'unique ligne — tenue aussi par une contrainte `CHECK` en base. */
const SETTINGS_ID = "default";

/**
 * Les réglages de la comptabilité, sur une ligne. Une classe pour les deux
 * ports, liés chacun par `useExisting` : c'est la même ligne, et deux
 * adaptateurs ne feraient que dupliquer la clé.
 */
@Injectable()
export class PrismaAccountingSettingsStore
  extends AccountingSettingsReader
  implements AccountingSettingsWriter
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(): Promise<AccountingSettings> {
    const row = await this.prisma.accountingSettings.findUnique({
      where: { id: SETTINGS_ID },
      select: { paymentLinkMaxCents: true },
    });
    return { paymentLinkMaxCents: row?.paymentLinkMaxCents ?? null };
  }

  async write(settings: AccountingSettingsWrite): Promise<void> {
    await this.prisma.accountingSettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...settings },
      update: settings,
    });
  }
}
