import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { StaffMailConsultations } from "../../sends/domain/entities/staff-mail-consultations.js";
import { loadStaffConsultations } from "../../sends/infrastructure/staff-consultation-window.js";
import { PreferenceConsultationsRepository } from "../domain/ports/preference-consultations.repository.js";

/**
 * Les consultations du registre, dans `mail.mail_preference_consultation`.
 * `load` est celui du suivi — même verrou, même compte des deux familles ;
 * à appeler sous une unité de travail.
 */
@Injectable()
export class PrismaPreferenceConsultationsRepository extends PreferenceConsultationsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  load(staffId: string, now: Date): Promise<StaffMailConsultations> {
    return loadStaffConsultations(this.prisma, staffId, now);
  }

  /** Les révélations (la ligne), puis les recherches (l'empreinte, les lignes trouvées). */
  async save(consultations: StaffMailConsultations): Promise<void> {
    const reveals = consultations.newReveals();
    if (reveals.length > 0) {
      await this.prisma.mailPreferenceConsultation.createMany({
        data: reveals.map((reveal) => ({
          id: reveal.id,
          kind: "reveal",
          staffId: reveal.staffId,
          preferenceId: reveal.sendId,
          consultedAt: reveal.at,
        })),
      });
    }
    for (const search of consultations.newSearches()) {
      await this.prisma.mailPreferenceConsultation.create({
        data: {
          id: search.id,
          kind: "search",
          staffId: search.staffId,
          fingerprint: search.fingerprint,
          consultedAt: search.at,
        },
      });
      if (search.sendIds.length > 0) {
        await this.prisma.mailPreferenceConsultationHit.createMany({
          data: search.sendIds.map((preferenceId) => ({ consultationId: search.id, preferenceId })),
        });
      }
    }
  }
}
