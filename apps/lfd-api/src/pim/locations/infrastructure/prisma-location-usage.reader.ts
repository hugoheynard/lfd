import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { LocationUsageReader } from "../domain/ports/location-usage.reader.js";

@Injectable()
export class PrismaLocationUsageReader extends LocationUsageReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  /**
   * Combien de familles citent chaque emplacement, **compté en base**.
   *
   * Il relisait toutes les grilles de canaux et rouvrait chaque `jsonb` en
   * mémoire, faute d'un endroit où la référence soit une ligne. Depuis que
   * `category_location_ref` existe — l'index que le dépôt des familles écrit
   * dans la même transaction que la colonne — la question redevient un
   * `groupBy` : un seul aller-retour, et rien à savoir de la forme du JSON.
   *
   * Les emplacements que personne ne cite sont **absents** de la table rendue :
   * un lecteur lit `?? 0`, il ne suppose pas la présence de la clé.
   */
  async countByLocation(): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.categoryLocationRef.groupBy({
      by: ["locationId"],
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.locationId, row._count._all]));
  }
}
