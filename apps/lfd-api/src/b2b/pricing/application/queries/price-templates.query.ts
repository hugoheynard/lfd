import { Injectable } from "@nestjs/common";
import type { PriceTemplateKind, PriceTemplateView } from "@lfd/contracts";

import { ProductCatalogReader } from "../../../catalog/domain/ports/product-catalog.reader.js";
import { PriceTemplatesReader, type StoredPriceTemplate } from "../ports/price-templates.reader.js";

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
    private readonly templates: PriceTemplatesReader,
    private readonly catalog: ProductCatalogReader,
  ) {}

  async list(kind: PriceTemplateKind): Promise<readonly PriceTemplateView[]> {
    return this.decorate(await this.templates.list(kind));
  }

  async byId(id: string): Promise<PriceTemplateView | null> {
    const template = await this.templates.byId(id);
    return template === null ? null : ((await this.decorate([template]))[0] ?? null);
  }

  /**
   * Le catalogue est résolu **en un lot pour tous les gabarits** : une lecture
   * par ligne ferait, sur une liste de gabarits d'une centaine de lignes,
   * autant de requêtes que d'articles — sur un écran qu'on ouvre pour lire.
   */
  private async decorate(
    stored: readonly StoredPriceTemplate[],
  ): Promise<readonly PriceTemplateView[]> {
    const states = stored.map((entry) => entry.state);
    const skus = [...new Set(states.flatMap((state) => state.lines.map((line) => line.sku)))];
    const catalogue = await this.catalog.resolveMany(skus);

    return states.map((state, index) => {
      const row = stored[index];
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
            catalogPriceMillicents: item?.unitPriceMillicents ?? null,
            tiers: line.tiers.map((tier) => ({ ...tier })),
            plannedVolume: line.plannedVolume,
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
