import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { LocationUsageReader } from "../domain/ports/location-usage.reader.js";

@Injectable()
export class PrismaLocationUsageReader extends LocationUsageReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  /**
   * Combien de familles vendent depuis chaque emplacement, **compté en base**.
   *
   * Il relisait toutes les grilles de canaux et rouvrait chaque `jsonb` en
   * mémoire, faute d'un endroit où la référence soit une ligne. Puis un index
   * dédié l'a porté. Il lit désormais `category_channel`, la matrice elle-même :
   * l'index n'était qu'un pis-aller pour tenir la clé étrangère, et la table
   * qui l'a remplacé contient la même information avec le contexte en plus.
   *
   * Groupé par POINT DE VENTE depuis p-2 — une boutique garde l'identifiant de
   * son emplacement, donc le compte de l'écran ne bouge pas.
   *
   * On compte les FAMILLES, pas les lignes : une famille qui vend deux
   * contextes au même endroit en produit deux, et l'écran dirait « 2 familles »
   * là où il n'y en a qu'une. Le `groupBy` porte donc sur la paire.
   *
   * Les emplacements que personne ne cite sont **absents** de la table rendue :
   * un lecteur lit `?? 0`, il ne suppose pas la présence de la clé.
   */
  async countByLocation(): Promise<ReadonlyMap<string, number>> {
    const rows = await this.prisma.categoryChannel.groupBy({
      by: ["pointOfSaleId", "categoryId"],
    });
    const counts = new Map<string, number>();
    for (const row of rows) {
      // `null` ne peut venir que d'une ligne écrite par le binaire précédent
      // pendant le déploiement de p-1 ; p-3 la rattrape et pose le `NOT NULL`.
      if (row.pointOfSaleId === null) {
        continue;
      }
      counts.set(row.pointOfSaleId, (counts.get(row.pointOfSaleId) ?? 0) + 1);
    }
    return counts;
  }
}
