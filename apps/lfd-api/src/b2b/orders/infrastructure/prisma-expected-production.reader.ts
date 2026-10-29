import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { SaleSkuAliasReader } from "../../catalog/domain/ports/sale-sku-alias.reader.js";
import {
  ExpectedProductionReader,
  type ExpectedDayProduction,
  type ServiceRange,
} from "../../../production/channels/commerce/index.js";
import { foldExpectedByArticle } from "./expected-production-fold.js";
import { planWhere } from "./plan-filter.js";

/**
 * **Ce que le commerce annonce au fournil pour les jours qui viennent.**
 *
 * ## Pourquoi cet adaptateur vit ici
 *
 * Le port est déclaré par la production, implémenté par le commerce,
 * relié par `appBootstrap` — même motif que `DueThresholds`, et même
 * raison : le fournil dépend d'une abstraction qu'il possède, et le commerce se
 * plie à ce qu'on lui demande sans rien exposer d'autre.
 *
 * ⚠️ **`placed` et rien d'autre**, exactement comme la clôture. Une commande
 * déjà basculée est inscrite au plan de sa journée, et ce plan est ce que la
 * matrice lit pour les journées closes : les compter ici les ferait apparaître
 * **deux fois** le jour où les deux sources se rejoindraient. La règle porte sur
 * l'énuméré du commerce, que la production n'a pas à connaître ; le jour où un
 * statut s'ajoute, deux fichiers de ce dossier bougent, et aucun du fournil.
 *
 * ## Une requête, un regroupement en mémoire
 *
 * Prisma ne sait pas grouper des lignes par une colonne de leur commande. Le
 * choix est donc entre un `$queryRaw` et une lecture suivie d'un pli : c'est la
 * seconde, parce qu'une plage fait quelques jours de commandes et que le SQL
 * écrit à la main est précisément ce que `lint:cross-schema-join` doit relire.
 *
 * Aucun montant ne franchit ce port : la sélection ne les demande pas, donc il
 * n'y a rien à laisser tomber par distraction.
 *
 * ## Une ligne par ARTICLE, pas par graphie
 *
 * Le pli se fait sur la référence canonique (`SaleSkuAliases.canonical`), et
 * c'est ici qu'il doit se faire : le fournil ne lit pas les tables du
 * commerce, il ne saurait pas qu'une ancienne référence (`PAI-001`) et sa
 * cible (`PAI-001-1`) sont le même article
 * (`documentation/catalogue/plan-defaut-sous-sa-reference.md`, § 2 b). Table
 * vide jusqu'à la bascule : chaque référence se lit comme elle-même.
 */
@Injectable()
export class PrismaExpectedProductionReader extends ExpectedProductionReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly aliasReader: SaleSkuAliasReader,
  ) {
    super();
  }

  async expectedBetween(range: ServiceRange): Promise<readonly ExpectedDayProduction[]> {
    const rows = await this.prisma.order.findMany({
      where: {
        // La colonne est un `date` Postgres, lu par Prisma à minuit UTC : on
        // compose les deux bornes de la même façon, comme `producibleFor` le
        // fait déjà pour un jour unique. Bornes COMPRISES des deux côtés — la
        // plage de l'écran inclut son dernier jour.
        requestedDeliveryDate: {
          gte: new Date(`${range.from.value}T00:00:00.000Z`),
          lte: new Date(`${range.to.value}T00:00:00.000Z`),
        },
        // 🔴 **Le fragment PARTAGÉ** (2026-09-17). Ce `where` posait « placed » à
        // la main et ignorait le règlement : le prévisionnel annonçait donc au
        // fournil des commandes que la clôture, elle, n'absorbait plus. Deux
        // écrans, deux chiffres, aucun moyen de savoir lequel croire.
        ...planWhere(),
      },
      select: {
        requestedDeliveryDate: true,
        lines: { select: { sku: true, productNameSnapshot: true, quantity: true, saleUnit: true } },
      },
    });

    const aliases = await this.aliasReader.around([
      ...new Set(rows.flatMap((row) => row.lines.map((line) => line.sku))),
    ]);
    return foldExpectedByArticle(rows, aliases);
  }
}
