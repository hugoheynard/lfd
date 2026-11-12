import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { ProductComplianceFinding } from "@lfd/pim-contracts";

import { PimContents } from "../../../changes/application/pim-contents.js";
import { listContent, PIM_CONTENT_KEYS } from "../../../changes/application/pim-content-keys.js";
import { ActiveSalesContextsReader } from "../../../sales-contexts/domain/ports/active-sales-contexts.reader.js";
import { CategoryNotFoundError } from "../../category/domain/errors/category-errors.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import {
  CatalogueReader,
  type CategoryVatPercents,
} from "../../shared/domain/ports/catalogue-reader.js";
import type { Audience } from "../../shared/domain/value-objects/audience.js";
import type { Product, ProductSnapshot } from "../domain/entities/product.js";
import { ProductRepository } from "../domain/ports/product.repository.js";
import type { ActivationGaps } from "../domain/services/activation-gaps.js";
import type { CompletenessRules } from "../domain/services/variant-completeness.js";
import { audienceView, type AudienceView } from "./audience-view.js";
import { readCompletenessRules } from "./completeness-support.js";
import { complianceFindingsOf } from "./compliance-view.js";
import { CitedAllergensReader } from "../domain/ports/cited-allergens.reader.js";
import { IllustratedProductsReader } from "../domain/ports/illustrated-products.reader.js";

/**
 * Ce qu'une activation dirait de la fiche — jugé par l'agrégat, avec le code
 * même qui accepte ou refuse `PUT :id/publish`. `activationGaps` vaut `null`
 * hors brouillon : une publiée n'a rien à activer, une archivée se restaure
 * d'abord ; dans les deux cas `activatable` est `false`.
 */
export interface ActivationView {
  readonly activatable: boolean;
  readonly activationGaps: ActivationGaps | null;
}

/** Une fiche telle que la liste la rend : son état, son audience résolue, son activabilité. */
export type ProductListItem = ProductSnapshot &
  AudienceView &
  ActivationView & {
    /** Elle porte au moins une image (filtre « Sans image », 2026-10-28). */
    readonly illustrated: boolean;
    /** Ses constats de conformité, calculés sur la même lecture ; vide hors fiche vivante. */
    readonly complianceWarnings: readonly ProductComplianceFinding[];
  };

/**
 * La liste et le numéro `pim` lu AVANT elle. La route nue n'en rend que les
 * lignes ; l'écran du référentiel retient le numéro pour ignorer l'écho de
 * son propre geste.
 */
export interface ProductListing {
  readonly version: number;
  readonly items: readonly ProductListItem[];
}

/** Lecture du catalogue — dispatchée par le `QueryBus`. Sans paramètre. */
export class ListProductsQuery {}

@QueryHandler(ListProductsQuery)
export class ListProductsHandler implements IQueryHandler<ListProductsQuery, ProductListing> {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly catalogue: CatalogueReader,
    private readonly contexts: ActiveSalesContextsReader,
    private readonly cited: CitedAllergensReader,
    private readonly illustrated: IllustratedProductsReader,
    private readonly contents: PimContents,
  ) {}

  /**
   * Servie sous le numéro `pim`, alertes comprises : rien n'y dépend de
   * l'appelant, et chaque table lue en fait monter le numéro. Le numéro
   * rendu est celui sous lequel la liste est servie, lu avant elle : une
   * écriture validée entre les deux le fait monter, et l'écran relira.
   */
  async execute(): Promise<ProductListing> {
    const { version, content } = await this.contents.versionedContentOf(
      PIM_CONTENT_KEYS.products,
      () => this.fromBase(),
      listContent<ProductListItem>(),
    );
    return { version, items: content };
  }

  /**
   * Familles, taux, contextes et règle du prix pro sont lus UNE fois pour
   * toute la liste, jamais une fois par fiche. Une fiche rattachée à une
   * famille inconnue est un REFUS, comme dans le lecteur du catalogue : un
   * rattachement cassé ne se maquille pas en héritage.
   *
   * Les constats de conformité sont rendus sur la même lecture : l'écran
   * n'a plus à relire tout le catalogue par `compliance-warnings`.
   */
  private async fromBase(): Promise<ProductListItem[]> {
    const [all, categories, rules] = await Promise.all([
      this.products.listAll(),
      this.categories.listAll(),
      readCompletenessRules(this.contexts),
    ]);
    // Les archivées restent (l'onglet « Archivées ») ; les supprimées sortent
    // de la liste, archives comprises (`plan-effacer-une-fiche-archivee.md`).
    const products = all.filter((product) => product.status !== "deleted");
    const audiences = new Map<string, Audience>(
      categories.map((category) => [category.id, category.audience]),
    );
    const ids = products.map((product) => product.id);
    const [vat, cited, illustrated] = await Promise.all([
      this.catalogue.vatPercents(
        products.map((product) => product.snapshot()),
        categories,
      ),
      this.cited.ofProducts(ids),
      this.illustrated.amongst(ids),
    ]);
    return products.map((product) => {
      const categoryAudience = audiences.get(product.categoryId);
      if (categoryAudience === undefined) {
        throw new CategoryNotFoundError(product.categoryId);
      }
      const resolved: Resolved = {
        vat: vat.get(product.id) ?? {},
        rules,
        citedAllergens: cited.get(product.id) ?? [],
        categoryAudience,
      };
      return {
        ...product.snapshot(),
        ...audienceView(product, categoryAudience),
        ...activationView(product, resolved),
        illustrated: illustrated.has(product.id),
        complianceWarnings: complianceFindingsOf(product, resolved),
      };
    });
  }
}

/** Ce que la fiche ne voit pas d'elle-même, résolu pour la liste. */
interface Resolved {
  readonly vat: CategoryVatPercents;
  readonly rules: CompletenessRules;
  readonly citedAllergens: readonly string[];
  readonly categoryAudience: Audience;
}

function activationView(product: Product, resolved: Resolved): ActivationView {
  if (product.status !== "draft") {
    return { activatable: false, activationGaps: null };
  }
  const { vat, rules, citedAllergens, categoryAudience } = resolved;
  return {
    activatable: product.isActivatableWith(vat, rules, citedAllergens, categoryAudience),
    activationGaps: product.activationGapsWith(vat, rules, citedAllergens, categoryAudience),
  };
}
