import type { CatalogFamilyView, ProductionGrouping } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import {
  type ProductionArticle,
  ProductionArticlesReader,
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
 * `documentation/fournil/les-postes-du-fournil.md`, § 3.4–3.7), selon le mode : le rayon
 * des articles du commerce en mode boutique, les articles puis les postes en
 * mode prod.
 *
 * Les deux modes lisent le rayon par la même lecture,
 * `ProductionArticlesReader.articlesOf` : le fournil est agnostique de l'état
 * de vente (décidé par Hugo le 2026-11-17). Un article masqué, réservé à une
 * clientèle, sans taux ou retiré se range sous son vrai rayon ; seul un SKU
 * absent du miroir tombe en « Hors catalogue ».
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

  /**
   * **Le poste de chaque SKU** — SKU → id de son poste ; un SKU absent n'a
   * pas de poste. Lu par la fiche quand un poste a un niveau de suivi propre
   * (`fournil/les-niveaux-de-suivi.md`), quel que soit le mode
   * de rangement : un rangement par poste déjà lu (`read`) suffit, sans
   * relire. `null` : articles ou postes illisibles — panne journalisée avec
   * ce qu'on lisait (`about`), jamais tue.
   */
  async workstationOfSkus(
    skus: readonly string[],
    about: string,
    read: GroupingSource,
  ): Promise<ReadonlyMap<string, string> | null> {
    if (read.mode === "workstation") {
      return workstationBySku(read.placement);
    }
    try {
      return workstationBySku(await this.placementOf([...new Set(skus)]));
    } catch (error) {
      this.logger.error(
        `${about} : postes illisibles, niveaux de suivi des postes inconnus.`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
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

  /** Le rayon de chaque SKU connu du miroir, ou `null` : panne journalisée, jamais tue. */
  private async shelvesOrNull(
    skus: readonly string[],
    about: string,
  ): Promise<ReadonlyMap<string, CatalogFamilyView> | null> {
    if (skus.length === 0) {
      return new Map();
    }
    try {
      const articles = await this.articles.articlesOf(skus);
      return new Map([...articles].map(([sku, article]) => [sku, article.family]));
    } catch (error) {
      this.logger.error(
        `${about} : rayons illisibles, servie en « Rayon inconnu ».`,
        error instanceof Error ? error.stack : String(error),
      );
      return null;
    }
  }
}

/** SKU → id du poste de son produit, d'après un rangement par poste. */
function workstationBySku(
  placement: Extract<GroupingSource, { readonly mode: "workstation" }>["placement"],
): ReadonlyMap<string, string> {
  const bySku = new Map<string, string>();
  for (const [sku, article] of placement.articles) {
    const workstation = placement.byProduct.get(article.productSku);
    if (workstation !== undefined) {
      bySku.set(sku, workstation);
    }
  }
  return bySku;
}
