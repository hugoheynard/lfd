import type { StaffNavPreferencesPatch } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { mergeStaffNavPreferences } from "../domain/staff-nav-preferences.js";
import { StaffNavPreferencesRepository } from "../domain/staff-nav-preferences.repository.js";
import { StaffUserNotFoundError } from "../domain/staff-user-errors.js";

/**
 * Adaptateur Prisma des préférences de navigation du staff.
 *
 * Relit le sac avant d'écrire, plutôt que de le remplacer : c'est ce qui permet
 * qu'une préférence n'en efface pas une autre, et la fusion elle-même est du
 * domaine (testable sans base).
 *
 * ⚠️ Lecture puis écriture, donc **le dernier écrivain gagne** si deux onglets
 * enregistrent au même instant. Assumé : il s'agit d'un réglage d'affichage
 * personnel, sans invariant à protéger, et un `jsonb_set` atomique coûterait du
 * SQL écrit à la main pour un conflit qui ne perd rien de plus qu'un clic.
 */
@Injectable()
export class PrismaStaffNavPreferencesRepository extends StaffNavPreferencesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async merge(staffUserId: string, patch: StaffNavPreferencesPatch): Promise<void> {
    const row = await this.prisma.staffUser.findUnique({
      where: { id: staffUserId },
      select: { navPrefs: true },
    });
    if (row === null) {
      throw new StaffUserNotFoundError(staffUserId);
    }
    await this.prisma.staffUser.update({
      where: { id: staffUserId },
      data: { navPrefs: { ...mergeStaffNavPreferences(row.navPrefs, patch) } },
    });
  }
}
