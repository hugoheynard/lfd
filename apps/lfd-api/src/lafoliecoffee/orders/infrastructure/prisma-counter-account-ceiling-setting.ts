import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CounterAccountCeilingSettingReader,
  type CounterAccountCeilingRecord,
} from "../domain/ports/counter-account-ceiling-setting.reader.js";
import { CounterAccountCeilingSettingRepository } from "../domain/ports/counter-account-ceiling-setting.repository.js";
import type { CounterAccountCeilingSetting } from "../domain/value-objects/counter-account-ceiling-setting.js";

/** La clé de l'unique ligne du réglage (CHECK `counter_account_settings_single`). */
const SETTINGS_KEY = "orders";

/** Adaptateur Prisma de l'écriture : la ligne unique, créée au premier geste. */
@Injectable()
export class PrismaCounterAccountCeilingSettingRepository extends CounterAccountCeilingSettingRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async put(setting: CounterAccountCeilingSetting): Promise<void> {
    const row = {
      ceilingCents: setting.ceilingCents,
      updatedAt: setting.updatedAt,
      updatedByStaffId: setting.updatedByStaffId,
    };
    await this.prisma.counterAccountSettings.upsert({
      where: { key: SETTINGS_KEY },
      create: { key: SETTINGS_KEY, ...row },
      update: row,
    });
  }
}

/** Adaptateur Prisma de la lecture : ligne absente = aucun plafond, aucun auteur. */
@Injectable()
export class PrismaCounterAccountCeilingSettingReader extends CounterAccountCeilingSettingReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async current(): Promise<CounterAccountCeilingRecord> {
    const row = await this.prisma.counterAccountSettings.findUnique({
      where: { key: SETTINGS_KEY },
      select: { ceilingCents: true, updatedAt: true, updatedByStaffId: true },
    });
    return row ?? { ceilingCents: null, updatedAt: null, updatedByStaffId: null };
  }
}
