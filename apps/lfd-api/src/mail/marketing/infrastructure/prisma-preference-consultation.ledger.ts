import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PreferenceConsultationLedger,
  type StoredPreferenceSearch,
} from "../domain/ports/preference-consultation.ledger.js";

/** Les consultations du registre, lues dans `mail.mail_preference_consultation`. */
@Injectable()
export class PrismaPreferenceConsultationLedger extends PreferenceConsultationLedger {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lastRevealedAt(staffId: string, preferenceId: string): Promise<Date | null> {
    const row = await this.prisma.mailPreferenceConsultation.findFirst({
      where: { kind: "reveal", staffId, preferenceId },
      orderBy: { consultedAt: "desc" },
      select: { consultedAt: true },
    });
    return row?.consultedAt ?? null;
  }

  async searchOf(searchId: string): Promise<StoredPreferenceSearch | null> {
    const row = await this.prisma.mailPreferenceConsultation.findFirst({
      where: { id: searchId, kind: "search" },
      include: { hits: { select: { preferenceId: true } } },
    });
    return row === null
      ? null
      : {
          id: row.id,
          staffId: row.staffId,
          at: row.consultedAt,
          preferenceIds: row.hits.map((hit) => hit.preferenceId),
        };
  }
}
