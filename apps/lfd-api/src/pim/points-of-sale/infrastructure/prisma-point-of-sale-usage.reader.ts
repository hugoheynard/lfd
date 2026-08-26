import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { PointOfSaleUsageReader } from "../domain/ports/point-of-sale-usage.reader.js";

@Injectable()
export class PrismaPointOfSaleUsageReader extends PointOfSaleUsageReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  /**
   * Compté en base, sur la matrice elle-même.
   *
   * Il relisait toutes les grilles de canaux et rouvrait chaque `jsonb` en
   * mémoire, faute d'un endroit où la référence soit une ligne. Puis un index
   * dédié l'a porté. Il lit désormais `category_channel` : l'index n'était qu'un
   * pis-aller pour tenir la clé étrangère, et la table qui l'a remplacé contient
   * la même information avec le contexte en plus.
   *
   * On compte les FAMILLES, pas les lignes : une famille qui vend deux contextes
   * au même endroit en produit deux, et l'écran dirait « 2 familles » là où il
   * n'y en a qu'une. Le `groupBy` porte donc sur la paire.
   *
   * Les points de vente que personne ne vend sont **absents** de la table
   * rendue : un lecteur lit `?? 0`, il ne suppose pas la présence de la clé.
   */
  async countByPointOfSale(): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.categoryChannel.groupBy({
      by: ["pointOfSaleId", "categoryId"],
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      counts.set(row.pointOfSaleId, (counts.get(row.pointOfSaleId) ?? 0) + 1);
    }
    return counts;
  }
}
