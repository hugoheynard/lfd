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
  /**
   * `false` : en mode prod, les postes n'ont pas pu être lus — rangé par
   * rayon. Toujours `true` en mode boutique, qui ne les lit pas.
   */
  readonly workstationsKnown: boolean;
}

/**
 * **Ce qu'un papier ou un écran du fournil lit pour ranger des SKU** (plan
 * `fournil/plan-postes-du-fournil.md`, § 3.4–3.7), selon le mode : les rayons
 * en mode boutique, les articles du commerce puis les postes en mode prod.
 * La fiche d'atelier, le dossier du jour, sa simulation et la route du
 * rangement lisent tous celle-ci : un seul rangement, une seule lecture.
 *
 * Devant une panne, elle ne choisit pas : en mode prod, des postes illisibles
 * rangent comme le mode boutique ; des rayons illisibles rangent tout en
 * « Rayon inconnu ». Chaque panne est journalisée avec ce qu'on lisait
 * (`about`), et dite dans la réponse. À l'appelant d'en tirer sa conduite —
 * la fiche le montre, le dossier ne s'archive pas, la simulation refuse.
 */
@Injectable()
export class GroupingSourceReading {
  private readonly logger = new Logger(GroupingSourceReading.name);

  constructor(
    private readonly shelves: WorkshopShelvesReader,
    private readonly articles: ProductionArticlesReader,
    private readonly workstations: WorkstationOfProducts,
  ) {}

  /**
   * @param about ce qu'on range, pour le journal (« Fiche d'atelier du 2026-11-17 »).
   */
  async read(
    skus: readonly string[],
    mode: ProductionGrouping,
    about: string,
  ): Promise<GroupingSourceRead> {
    const distinct = [...new Set(skus)];
    if (mode === "workstation") {
      try {
        const placement = await this.placementOf(distinct);
        return { source: { mode, placement }, shelvesKnown: true, workstationsKnown: true };
      } catch (error) {
        this.logger.error(
          `${about} : postes illisibles, servie rangée par rayon.`,
          error instanceof Error ? error.stack : String(error),
        );
        const shelves = await this.shelvesOrNull(distinct, about);
        return {
          source: { mode: "shelf", shelves },
          shelvesKnown: shelves !== null,
          workstationsKnown: false,
        };
      }
    }
    const shelves = await this.shelvesOrNull(distinct, about);
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
    const articles: ReadonlyMap<string, ProductionArticle> =
      skus.length === 0 ? new Map() : await this.articles.articlesOf(skus);
    const productSkus = [...new Set([...articles.values()].map((item) => item.productSku))];
    const { workstations, byProduct } = await this.workstations.workstationsOf(productSkus);
    return { workstations, articles, byProduct };
  }

  /** Les rayons, ou `null` : panne journalisée, jamais tue. */
  private async shelvesOrNull(
    skus: readonly string[],
    about: string,
  ): Promise<ReadonlyMap<string, CatalogFamilyView> | null> {
    if (skus.length === 0) {
      return new Map();
    }
    try {
      return await this.shelves.shelvesOf(skus);
    } catch (error) {
      this.logger.error(
        `${about} : rayons illisibles, servie en « Rayon inconnu ».`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}
