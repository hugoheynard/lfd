import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  ExpectedProductionReader,
  type ExpectedDayProduction,
  type ServiceRange,
} from "../../../production/channels/commerce/index.js";

/**
 * **Ce que le commerce annonce au fournil pour les jours qui viennent.**
 *
 * ## Pourquoi cet adaptateur vit ici
 *
 * Le port est déclaré par la production, implémenté par le commerce,
 * relié par `appBootstrap` — même motif que `PrismaDayOrdersReader`, et même
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
 */
@Injectable()
export class PrismaExpectedProductionReader extends ExpectedProductionReader {
  constructor(private readonly prisma: PrismaService) {
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
        status: "placed",
      },
      select: {
        requestedDeliveryDate: true,
        lines: { select: { sku: true, productNameSnapshot: true, quantity: true } },
      },
    });

    const byDay = new Map<string, Map<string, { productName: string; quantity: number }>>();
    for (const row of rows) {
      if (row.requestedDeliveryDate === null) {
        continue;
      }
      const day = row.requestedDeliveryDate.toISOString().slice(0, 10);
      const items = byDay.get(day) ?? new Map<string, { productName: string; quantity: number }>();
      for (const line of row.lines) {
        const known = items.get(line.sku);
        items.set(line.sku, {
          productName: known?.productName ?? line.productNameSnapshot,
          quantity: (known?.quantity ?? 0) + line.quantity,
        });
      }
      byDay.set(day, items);
    }

    return [...byDay.entries()].map(([day, items]) => ({
      day,
      items: [...items.entries()].map(([sku, item]) => ({
        sku,
        productName: item.productName,
        quantity: item.quantity,
      })),
    }));
  }
}
