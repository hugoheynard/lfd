import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  LoyaltySettingsReader,
  type LoyaltySettingsWriter,
} from "../domain/ports/loyalty-settings.store.js";
import { LoyaltySettings } from "../domain/value-objects/loyalty-settings.js";

/** La clé de l'unique ligne — tenue aussi par une contrainte `CHECK` en base. */
const SETTINGS_ID = "default";

/**
 * Le réglage du programme, sur une ligne. Une classe pour les deux ports, liés
 * chacun par `useExisting` : c'est la même ligne (même geste que
 * `PrismaAccountingSettingsStore`).
 */
@Injectable()
export class PrismaLoyaltySettingsStore
  extends LoyaltySettingsReader
  implements LoyaltySettingsWriter
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async read(): Promise<LoyaltySettings | null> {
    const row = await this.prisma.loyaltySettings.findUnique({
      where: { id: SETTINGS_ID },
      select: {
        pointsPerStep: true,
        stepValueCents: true,
        openToPublic: true,
        openToPro: true,
        voucherValidityDays: true,
      },
    });
    return row === null ? null : LoyaltySettings.of(row);
  }

  async write(settings: LoyaltySettings, updatedAt: Date, updatedByStaffId: string): Promise<void> {
    const columns = { ...settings.toInput(), updatedAt, updatedByStaffId };
    await this.prisma.loyaltySettings.upsert({
      where: { id: SETTINGS_ID },
      create: { id: SETTINGS_ID, ...columns },
      update: columns,
    });
  }
}
