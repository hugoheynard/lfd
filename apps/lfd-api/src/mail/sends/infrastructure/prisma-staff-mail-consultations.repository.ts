import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { StaffMailConsultations } from "../domain/entities/staff-mail-consultations.js";
import { StaffMailConsultationsRepository } from "../domain/ports/staff-mail-consultations.repository.js";
import { loadStaffConsultations } from "./staff-consultation-window.js";

/**
 * Les consultations d'une personne : révélations et recherches de la
 * dernière heure, comptées ENSEMBLE avec celles du registre de préférence
 * (le plafond est partagé, décision 8 ; C4).
 *
 * `load` pose d'abord `pg_advisory_xact_lock` sur la personne, relâché au
 * `COMMIT` ou au `ROLLBACK` : deux révélations simultanées ne lisent pas le
 * même compte. Il doit donc être appelé sous une unité de travail.
 */
@Injectable()
export class PrismaStaffMailConsultationsRepository extends StaffMailConsultationsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /** Le plafond partagé avec le registre de préférence (C4), sous le verrou de la personne. */
  load(staffId: string, now: Date): Promise<StaffMailConsultations> {
    return loadStaffConsultations(this.prisma, staffId, now);
  }

  /** Les révélations, puis les recherches et leurs envois trouvés — jamais une adresse. */
  async save(consultations: StaffMailConsultations): Promise<void> {
    await this.saveSearches(consultations);
    const reveals = consultations.newReveals();
    if (reveals.length === 0) {
      return;
    }
    await this.prisma.mailRecipientReveal.createMany({
      data: reveals.map((reveal) => ({
        id: reveal.id,
        mailRequestId: reveal.sendId,
        revealedBy: reveal.staffId,
        revealedAt: reveal.at,
      })),
    });
  }

  private async saveSearches(consultations: StaffMailConsultations): Promise<void> {
    for (const search of consultations.newSearches()) {
      await this.prisma.mailRecipientSearch.create({
        data: {
          id: search.id,
          searchedBy: search.staffId,
          recipientFingerprint: search.fingerprint,
          searchedAt: search.at,
        },
      });
      if (search.sendIds.length > 0) {
        await this.prisma.mailRecipientSearchHit.createMany({
          data: search.sendIds.map((mailRequestId) => ({ searchId: search.id, mailRequestId })),
        });
      }
    }
  }
}
