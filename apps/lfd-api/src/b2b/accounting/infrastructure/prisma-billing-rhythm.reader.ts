import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { BillingRhythmReader } from "../domain/ports/billing-rhythm.reader.js";
import { BillingRhythm } from "../domain/value-objects/billing-rhythm.js";
import { BillingRhythmSetting } from "../domain/value-objects/billing-rhythm-setting.js";

/**
 * Le rythme réglé sur `legal_entities` (R2) — cinq colonnes relues par les
 * factories du value object : une ligne corrompue est refusée, jamais
 * réhydratée telle quelle (`BillingRhythm.fromRecord`).
 */
@Injectable()
export class PrismaBillingRhythmReader extends BillingRhythmReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async settingOf(legalEntityId: string): Promise<BillingRhythmSetting | null> {
    const row = await this.prisma.legalEntity.findUnique({
      where: { id: legalEntityId },
      select: {
        billingRhythmKind: true,
        billingRhythmDays: true,
        nextBillingRhythmKind: true,
        nextBillingRhythmDays: true,
        nextBillingRhythmEffectiveAt: true,
      },
    });
    return row === null ? null : billingRhythmSettingOf(row);
  }
}

/** Les cinq colonnes du rythme sur `legal_entities`, telles que Prisma les rend. */
export interface BillingRhythmColumns {
  readonly billingRhythmKind: string;
  readonly billingRhythmDays: readonly number[];
  readonly nextBillingRhythmKind: string | null;
  readonly nextBillingRhythmDays: readonly number[];
  readonly nextBillingRhythmEffectiveAt: Date | null;
}

/**
 * Le réglage relu par les factories du value object — partagé avec la lecture
 * des périodes des factures, qui joint l'entité de l'issue.
 */
export function billingRhythmSettingOf(row: BillingRhythmColumns): BillingRhythmSetting {
  const current = BillingRhythm.fromRecord({
    kind: row.billingRhythmKind,
    days: row.billingRhythmDays,
  });
  if (row.nextBillingRhythmKind === null || row.nextBillingRhythmEffectiveAt === null) {
    return BillingRhythmSetting.of(current, null);
  }
  return BillingRhythmSetting.of(current, {
    rhythm: BillingRhythm.fromRecord({
      kind: row.nextBillingRhythmKind,
      days: row.nextBillingRhythmDays,
    }),
    effectiveAt: row.nextBillingRhythmEffectiveAt,
  });
}
