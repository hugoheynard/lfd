import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { readSalesChannelsColumn } from "../../catalogue/shared/infrastructure/json-readers.js";
import { referencedEmplacements } from "../../catalogue/shared/domain/value-objects/sales-channels.js";
import { EmplacementUsageReader } from "../domain/ports/emplacement-usage.reader.js";

@Injectable()
export class PrismaEmplacementUsageReader extends EmplacementUsageReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  /**
   * Compte les familles dont la grille coche cet emplacement.
   *
   * **Sans SQL brut, et sans filtre `jsonb`.** La surface Prisma du référentiel
   * est énumérée modèle par modèle, délibérément : y ouvrir `$queryRaw` rendrait
   * toute la base atteignable depuis n'importe quel dépôt du PIM, ce que ce mur
   * existe pour empêcher. Et un filtre sur clé `jsonb` demanderait de réécrire
   * ici la forme de la colonne — un second endroit qui saurait comment elle est
   * faite, à tenir aligné avec le premier.
   *
   * On relit donc les grilles avec le lecteur qui fait foi. La table des
   * familles se compte en dizaines de lignes ; ce contrôle ne s'exécute qu'à la
   * suppression d'un emplacement, un geste rare et délibéré.
   */
  async countCategoriesUsing(emplacementId: string): Promise<number> {
    return (await this.countByEmplacement()).get(emplacementId) ?? 0;
  }

  /** Une seule lecture des grilles, comptée par emplacement cité. */
  async countByEmplacement(): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.category.findMany({ select: { channelPreset: true } });
    const counts = new Map<string, number>();
    for (const row of rows) {
      const preset = readSalesChannelsColumn(row.channelPreset, "category.channelPreset");
      for (const id of referencedEmplacements(preset)) {
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  }
}
