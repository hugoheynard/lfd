import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { NavPreferencesRepository } from "../domain/ports/nav-preferences.repository.js";
import type { CatalogueView } from "../domain/value-objects/nav-preferences.js";

/**
 * Adaptateur Prisma des préférences de navigation. Écrit le sac JSON `nav_prefs`
 * de la personne — on ne stocke que des vues concrètes (jamais `null` en
 * écriture : « aucun choix » est simplement l'absence de colonne / de clé).
 */
@Injectable()
export class PrismaNavPreferencesRepository extends NavPreferencesRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async saveCatalogueView(userId: string, view: CatalogueView): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { navPrefs: { catalogueView: view } },
    });
  }
}
