import type { CatalogFamilyView, ProductionGrouping } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import {
  type ProductionArticle,
  ProductionArticlesReader,
} from "../../../channels/commerce/production-articles.reader.js";
import { WorkshopShelvesReader } from "../../../channels/commerce/workshop-shelves.reader.js";
import type { ProductionLineSnapshot } from "../../../day/index.js";
import type { GroupingSource } from "../../../shared/print/index.js";
import { WorkstationOfProducts } from "../../../workstations/index.js";

/** Le rangement du dossier, et ce que ses lectures ont pu dire. */
export interface DossierGrouping {
  readonly source: GroupingSource;
  /** `false` : les rayons n'ont pas pu être lus — tout est en « Rayon inconnu ». */
  readonly shelvesRead: boolean;
  /** `false` : en mode prod, les postes n'ont pas pu être lus — rangé par rayon. */
  readonly workstationsRead: boolean;
}

/**
 * **Ce que le dossier du jour lit pour se ranger** (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.4–3.5) : les rayons en mode
 * boutique, les articles et les postes en mode prod. Chaque panne est
 * journalisée, jamais tue, et dite dans la réponse : le rendu en déduit que
 * le dossier n'est pas archivable.
 */
@Injectable()
export class DossierGroupingReading {
  private readonly logger = new Logger(DossierGroupingReading.name);

  constructor(
    private readonly shelves: WorkshopShelvesReader,
    private readonly articles: ProductionArticlesReader,
    private readonly workstations: WorkstationOfProducts,
  ) {}

  /**
   * Le produit et le rayon de chaque SKU au commerce, sans les filtres de
   * vente, puis le poste de ces produits. Une panne lève.
   */
  private async placementOf(
    skus: readonly string[],
  ): Promise<Extract<GroupingSource, { readonly mode: "workstation" }>["placement"]> {
    const articles: ReadonlyMap<string, ProductionArticle> =
      skus.length === 0 ? new Map() : await this.articles.articlesOf(skus);
    const productSkus = [...new Set([...articles.values()].map((item) => item.productSku))];
    const { workstations, byProduct } = await this.workstations.workstationsOf(productSkus);
    return { workstations, articles, byProduct };
  }

  /**
   * Ce que le rangement lit, selon le mode. Le mode boutique ne lit que les
   * rayons. Le mode prod lit les articles et les postes ; leur panne range le
   * dossier comme en mode boutique, journalisée, et il n'est pas archivé.
   */
  async read(
    serviceDay: string,
    lines: readonly ProductionLineSnapshot[],
    mode: ProductionGrouping,
  ): Promise<DossierGrouping> {
    if (mode === "workstation") {
      try {
        const skus = [...new Set(lines.map((line) => line.sku))];
        const placement = await this.placementOf(skus);
        return { source: { mode, placement }, shelvesRead: true, workstationsRead: true };
      } catch (error) {
        this.logger.error(
          `Dossier du ${serviceDay} : postes illisibles, rangé par rayon et non archivé.`,
          error instanceof Error ? error.stack : String(error),
        );
        const shelves = await this.shelvesOrNull(serviceDay, lines);
        const source = { mode: "shelf", shelves } as const;
        return { source, shelvesRead: shelves !== null, workstationsRead: false };
      }
    }
    const shelves = await this.shelvesOrNull(serviceDay, lines);
    return { source: { mode, shelves }, shelvesRead: shelves !== null, workstationsRead: true };
  }

  /**
   * Les rayons des SKU du jour — commandes ET réassorts, qui vont sur les mêmes
   * fiches de poste (R3d-bis) —, ou `null` : panne journalisée, jamais tue.
   */
  private async shelvesOrNull(
    serviceDay: string,
    lines: readonly ProductionLineSnapshot[],
  ): Promise<ReadonlyMap<string, CatalogFamilyView> | null> {
    const skus = [...new Set(lines.map((line) => line.sku))];
    try {
      return await this.shelves.shelvesOf(skus);
    } catch (error) {
      this.logger.error(
        `Dossier du ${serviceDay} : rayons illisibles, tiré en « Rayon inconnu » et non archivé.`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
