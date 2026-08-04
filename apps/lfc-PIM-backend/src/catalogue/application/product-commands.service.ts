import { Inject, Injectable } from '@nestjs/common';

import { IdGenerator } from '../../shared/identity/id-generator.js';
import {
  CategoryArchivedError,
  CategoryNotFoundError,
  ProductNotFoundError,
  VariantNotFoundError,
} from '../domain/errors/catalogue-errors.js';
import { CategoryRepository } from '../domain/ports/category.repository.js';
import { EditorialRepository } from '../domain/ports/editorial.repository.js';
import { NutritionRepository } from '../domain/ports/nutrition.repository.js';
import {
  ProductRepository,
  type ProductKind,
} from '../domain/ports/product.repository.js';
import {
  productSkuRoot,
  proposeSku,
  variantSkuRoot,
  type SkuAvailability,
} from '../domain/services/sku-generator.js';
import {
  localizedText,
  slugify,
  type LocalizedText,
} from '../domain/value-objects/localized-text.js';
import {
  editorial,
  isEmptyEditorial,
  mediaItems,
  type EditorialInput,
  type MediaInput,
} from '../domain/value-objects/editorial.js';
import {
  nutritionDeclaration,
  type NutritionValues,
} from '../domain/value-objects/nutrition-declaration.js';
import { Sku } from '../domain/value-objects/sku.value-object.js';
import { SKU_AVAILABILITY } from '../infrastructure/prisma-sku-availability.js';

export interface CreateProductInput {
  readonly nameFr: string;
  readonly nameEn?: string | undefined;
  readonly kind: ProductKind;
  readonly categoryId: string;
  /** Laissé vide, une référence lisible est **proposée**. */
  readonly sku?: string | undefined;
  /**
   * Fiche réglementaire de la déclinaison par défaut. **Absente** = non renseignée
   * (bloque la publication) ; `[]` = « aucun allergène », une affirmation positive.
   */
  readonly allergens?: readonly string[] | undefined;
  readonly mayContain?: readonly string[] | undefined;
  readonly nutrition?: NutritionValues | undefined;
  /** Couche éditoriale — entièrement optionnelle. */
  readonly editorial?: EditorialInput | undefined;
  readonly media?: readonly MediaInput[] | undefined;
}

@Injectable()
export class ProductCommands {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly nutrition: NutritionRepository,
    private readonly editorials: EditorialRepository,
    @Inject(IdGenerator) private readonly ids: IdGenerator,
    @Inject(SKU_AVAILABILITY) private readonly availability: SkuAvailability,
  ) {}

  /**
   * Crée le produit **et sa déclinaison par défaut** — indissociables (invariant 2).
   * La persistance les écrit en une transaction : l'invariant n'est jamais faux.
   */
  async create(input: CreateProductInput): Promise<string> {
    const name = localizedText('nom', input.nameFr, input.nameEn);
    const category = await this.categories.findById(input.categoryId);

    if (category === null) {
      throw new CategoryNotFoundError(input.categoryId);
    }
    if (category.isArchived) {
      throw new CategoryArchivedError(input.categoryId);
    }

    const sku =
      input.sku === undefined || input.sku.trim() === ''
        ? await proposeSku(
            productSkuRoot(category.slug.fr, name.fr),
            this.availability,
          )
        : Sku.create(input.sku);

    // Validée AVANT toute écriture : une fiche refusée ne doit pas laisser
    // derrière elle un produit à moitié créé.
    const declaration =
      input.allergens === undefined
        ? null
        : nutritionDeclaration(
            input.allergens,
            input.mayContain ?? [],
            input.nutrition ?? {},
          );

    const story = editorial(input.editorial ?? {});
    const visuals = mediaItems(input.media ?? []);

    const productId = this.ids.next();
    const variantId = this.ids.next();
    const variantSku = await proposeSku(
      variantSkuRoot(sku, new Map(), 0),
      this.availability,
    );

    await this.products.createWithDefaultVariant({
      id: productId,
      sku,
      name,
      slug: this.slugOf(name),
      kind: input.kind,
      categoryId: input.categoryId,
      defaultVariant: { id: variantId, sku: variantSku, name },
    });

    if (declaration !== null) {
      await this.nutrition.declare(variantId, declaration);
    }
    // Pas de ligne éditoriale si personne n'a rien écrit (satellite optionnel).
    if (!isEmptyEditorial(story) || visuals.length > 0) {
      await this.editorials.save(productId, story, visuals);
    }

    return productId;
  }

  async rename(id: string, nameFr: string, nameEn?: string): Promise<void> {
    await this.requireProduct(id);
    const name = localizedText('nom', nameFr, nameEn);
    await this.products.rename(id, name, this.slugOf(name));
  }

  async changeKind(id: string, kind: ProductKind): Promise<void> {
    await this.requireProduct(id);
    await this.products.setKind(id, kind);
  }

  /** Reclasse le produit sous une autre famille — refuse une famille archivée. */
  async moveToCategory(id: string, categoryId: string): Promise<void> {
    await this.requireProduct(id);
    const category = await this.categories.findById(categoryId);
    if (category === null) {
      throw new CategoryNotFoundError(categoryId);
    }
    if (category.isArchived) {
      throw new CategoryArchivedError(categoryId);
    }
    await this.products.moveToCategory(id, categoryId);
  }

  /** Prix canonique HT (centimes) d'une déclinaison ; `null` = dé-tarifer. */
  async setVariantPrice(
    productId: string,
    variantId: string,
    priceCents: number | null,
  ): Promise<void> {
    await this.requireVariant(productId, variantId);
    await this.products.setVariantPrice(variantId, priceCents);
  }

  /** Poids net (grammes) d'une déclinaison ; `null` = effacer. */
  async setVariantWeight(
    productId: string,
    variantId: string,
    weightGrams: number | null,
  ): Promise<void> {
    await this.requireVariant(productId, variantId);
    await this.products.setVariantWeight(variantId, weightGrams);
  }

  /**
   * Met à jour la couche éditoriale (texte). Les médias suivent leur propre cycle
   * (doc 01) et ne sont **pas** touchés ici — d'où la liste vide passée à `save`.
   */
  async updateEditorial(id: string, input: EditorialInput): Promise<void> {
    await this.requireProduct(id);
    await this.editorials.save(id, editorial(input), []);
  }

  /** (Re)déclare la fiche réglementaire d'une déclinaison (doc 03). */
  async declareNutrition(
    productId: string,
    variantId: string,
    input: {
      allergens: readonly string[];
      mayContain?: readonly string[] | undefined;
      nutrition?: NutritionValues | undefined;
    },
  ): Promise<void> {
    await this.requireVariant(productId, variantId);
    const declaration = nutritionDeclaration(
      input.allergens,
      input.mayContain ?? [],
      input.nutrition ?? {},
    );
    await this.nutrition.declare(variantId, declaration);
  }

  async archive(id: string): Promise<void> {
    await this.requireProduct(id);
    await this.products.setStatus(id, 'archived');
  }

  async restore(id: string): Promise<void> {
    await this.requireProduct(id);
    await this.products.setStatus(id, 'draft');
  }

  private slugOf(name: LocalizedText): LocalizedText {
    return name.en === undefined
      ? { fr: slugify(name.fr) }
      : { fr: slugify(name.fr), en: slugify(name.en) };
  }

  private async requireProduct(id: string): Promise<void> {
    if ((await this.products.findById(id)) === null) {
      throw new ProductNotFoundError(id);
    }
  }

  /**
   * Garantit que la déclinaison appartient bien au produit visé — sinon une
   * requête forgée pourrait tarifer la variante d'un autre produit.
   */
  private async requireVariant(
    productId: string,
    variantId: string,
  ): Promise<void> {
    const product = await this.products.findById(productId);
    if (product === null) {
      throw new ProductNotFoundError(productId);
    }
    if (!product.variants.some((variant) => variant.id === variantId)) {
      throw new VariantNotFoundError(productId, variantId);
    }
  }
}
