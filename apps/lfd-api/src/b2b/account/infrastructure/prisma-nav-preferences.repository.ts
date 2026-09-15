import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { NavPreferencesRepository } from "../domain/ports/nav-preferences.repository.js";
import type { NavPreferencesPatch } from "../domain/value-objects/nav-preferences.js";

/**
 * Adaptateur Prisma des préférences de navigation : le sac JSON `nav_prefs`.
 *
 * **Une fusion `jsonb ||`, en SQL.** Prisma n'écrit une colonne `Json` qu'en la
 * remplaçant entière, et c'est ce que faisait l'écriture d'avant : poser la vue
 * du catalogue effaçait l'espace de travail. `COALESCE` couvre les comptes dont
 * la colonne est encore `NULL`. `workspace: null` est écrit tel quel : c'est
 * l'effacement du choix, que la relecture rend `null`.
 *
 * ⚠️ `users.updated_at` n'avance pas : c'est Prisma, et non la base, qui le
 * pose, et une préférence d'affichage n'est pas une modification du compte.
 */
@Injectable()
export class PrismaNavPreferencesRepository extends NavPreferencesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async merge(userId: string, patch: NavPreferencesPatch): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE "public"."users"
      SET "nav_prefs" = COALESCE("nav_prefs", '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb
      WHERE "id" = ${userId}`;
  }
}
