import { Injectable } from "@nestjs/common";
import type { PriceTemplateKind, PriceTemplateView } from "@lfd/contracts";

import { PrismaService } from "../../../infra/database/prisma.service.js";
import { ProductCatalogReader } from "../../../orders/domain/ports/product-catalog.reader.js";
import { templateStateFromRow } from "../../infrastructure/price-template-rows.js";
import type { TemplateRow } from "../../infrastructure/price-template-rows.js";

/**
 * **Les gabarits, avec le tarif catalogue en regard.**
 *
 * La colonne de comparaison est la seule qui donne un sens aux autres :
 * « 0,80 € » ne se juge pas, « 0,80 € contre 1,00 € au catalogue » se juge.
 *
 * Elle est **lue à l'affichage**, jamais figée dans le gabarit. Un canonique
 * recopié au moment de la composition vieillirait en silence : six mois plus
 * tard, l'écart affiché serait faux et rien ne le signalerait — alors que c'est
 * précisément l'écart que le commercial regarde avant de reposer la grille.
 */
@Injectable()
export class PriceTemplatesQuery {
  constructor(
    private readonly prisma: PrismaService,
    private readonly catalog: ProductCatalogReader,
  ) {}

  async list(kind: PriceTemplateKind): Promise<readonly PriceTemplateView[]> {
    const rows = await this.prisma.priceTemplate.findMany({
      where: { kind, archivedAt: null },
      orderBy: { updatedAt: "desc" },
    });
    return this.decorate(rows);
  }

  async byId(id: string): Promise<PriceTemplateView | null> {
    const row = await this.prisma.priceTemplate.findUnique({ where: { id } });
    return row === null ? null : ((await this.decorate([row]))[0] ?? null);
  }

  /**
   * Le catalogue est résolu **en un lot pour tous les gabarits** : une lecture
   * par ligne ferait, sur une liste de gabarits d'une centaine de lignes,
   * autant de requêtes que d'articles — sur un écran qu'on ouvre pour lire.
   */
  private async decorate(rows: readonly TemplateRow[]): Promise<readonly PriceTemplateView[]> {
    const states = rows.map(templateStateFromRow);
    const skus = [...new Set(states.flatMap((state) => state.lines.map((line) => line.sku)))];
    const catalogue = await this.catalog.resolveMany(skus);

    return states.map((state, index) => {
      const row = rows[index];
      return {
        id: state.id,
        kind: state.kind,
        label: state.label,
        lines: state.lines.map((line) => {
          const item = catalogue.get(line.sku) ?? null;
          return {
            sku: line.sku,
            // Le SKU nu quand le catalogue ne le connaît plus : le gabarit garde
            // la ligne, et l'écran doit pouvoir dire qu'elle ne vise plus rien.
            productName: item?.name ?? line.sku,
            catalogPriceCents: item?.unitPriceCents ?? null,
            tiers: line.tiers.map((tier) => ({ ...tier })),
          };
        }),
        createdBy: state.createdBy,
        createdAt: row?.createdAt.toISOString() ?? "",
        updatedAt: row?.updatedAt.toISOString() ?? "",
        archivedAt: state.archivedAt?.toISOString() ?? null,
      };
    });
  }
}
