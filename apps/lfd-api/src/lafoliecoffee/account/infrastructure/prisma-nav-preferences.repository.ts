import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { NavPreferencesRepository } from "../domain/ports/nav-preferences.repository.js";
import type { NavPreferencesPatch } from "../domain/value-objects/nav-preferences.js";

/**
 * Adaptateur Prisma des préférences de navigation d'un client : la table
 * `user_nav_prefs`, une ligne par personne (plan
 * `caching-usage/qui-est-le-client.md`, « Les préférences de navigation hors de `users` »).
 *
 * **Une fusion `jsonb ||`, en SQL.** Prisma n'écrit une colonne `Json` qu'en la
 * remplaçant entière : poser la vue du catalogue effacerait l'espace de
 * travail. La première écriture crée la ligne, les suivantes fusionnent.
 * `workspace: null` est écrit tel quel : c'est l'effacement du choix, que la
 * relecture rend `null`.
 *
 * 🔴 Plus jamais `users` : son déclencheur ferait monter l'estampille du
 * principal à chaque changement d'espace. `updated_at` est posé par le SQL —
 * `@updatedAt` ne s'applique pas à `$executeRaw`.
 */
@Injectable()
export class PrismaNavPreferencesRepository extends NavPreferencesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async merge(userId: string, patch: NavPreferencesPatch): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO "public"."user_nav_prefs" ("user_id", "prefs", "updated_at")
      VALUES (${userId}, ${JSON.stringify(patch)}::jsonb, now())
      ON CONFLICT ("user_id") DO UPDATE
        SET "prefs" = "user_nav_prefs"."prefs" || excluded."prefs",
            "updated_at" = excluded."updated_at"`;
  }
}
