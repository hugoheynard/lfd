import type { CatalogFamilyView, ProductionGrouping } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import {
  type ProductionArticle,
  ProductionArticlesReader,
  WorkshopShelvesReader,
} from "../../../channels/commerce/index.js";
import type { GroupingSource } from "../../../shared/print/index.js";
import { WorkstationOfProducts } from "../../domain/ports/workstation-of-products.js";

/** Ce que le rangement lit, et ce que ses lectures ont pu dire. */
export interface GroupingSourceRead {
  readonly source: GroupingSource;
  /** `false` : les rayons n'ont pas pu être lus — tout est en « Rayon inconnu ». */
  readonly shelvesKnown: boolean;
  /** `false` : en mode prod, les postes n'ont pas pu être lus — rangé par rayon. */
  readonly workstationsKnown: boolean;
}

/**
 * **Ce que la route du rangement lit pour ranger des SKU** (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.7), selon le mode : les rayons en
 * mode boutique (exactement ce que la fiche lit), les articles du commerce et
 * les postes en mode prod.
 *
 * Même conduite que la fiche d'atelier devant une panne : en mode prod, des
 * postes illisibles rangent comme le mode boutique ; des rayons illisibles
 * rangent tout en « Rayon inconnu ». Chaque panne est journalisée et dite dans
 * la réponse, pour que l'écran la montre au lieu d'un rangement qui mentirait.
 */
@Injectable()
export class GroupingSourceReading {
  private readonly logger = new Logger(GroupingSourceReading.name);

  constructor(
    private readonly shelves: WorkshopShelvesReader,
    private readonly articles: ProductionArticlesReader,
    private readonly workstations: WorkstationOfProducts,
  ) {}

  async read(skus: readonly string[], mode: ProductionGrouping): Promise<GroupingSourceRead> {
    if (mode === "workstation") {
      try {
        const placement = await this.placementOf(skus);
        return { source: { mode, placement }, shelvesKnown: true, workstationsKnown: true };
      } catch (error) {
        this.logger.error(
          "Rangement servi au front : postes illisibles, rangé par rayon.",
          error instanceof Error ? error.stack : String(error),
        );
        const shelves = await this.shelvesOrNull(skus);
        return {
          source: { mode: "shelf", shelves },
          shelvesKnown: shelves !== null,
          workstationsKnown: false,
        };
      }
    }
    const shelves = await this.shelvesOrNull(skus);
    return {
      source: { mode: "shelf", shelves },
      shelvesKnown: shelves !== null,
      workstationsKnown: true,
    };
  }

  /** Le produit et le rayon de chaque SKU, sans les filtres de vente, puis leurs postes. Une panne lève. */
  private async placementOf(
    skus: readonly string[],
  ): Promise<Extract<GroupingSource, { readonly mode: "workstation" }>["placement"]> {
    const articles: ReadonlyMap<string, ProductionArticle> = await this.articles.articlesOf(skus);
    const productSkus = [...new Set([...articles.values()].map((item) => item.productSku))];
    const { workstations, byProduct } = await this.workstations.workstationsOf(productSkus);
    return { workstations, articles, byProduct };
  }

  /** Les rayons, ou `null` : panne journalisée, jamais tue. */
  private async shelvesOrNull(
    skus: readonly string[],
  ): Promise<ReadonlyMap<string, CatalogFamilyView> | null> {
    try {
      return await this.shelves.shelvesOf(skus);
    } catch (error) {
      this.logger.error(
        "Rangement servi au front : rayons illisibles, tout en « Rayon inconnu ».",
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
