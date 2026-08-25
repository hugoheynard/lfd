import { PimJournal } from "../../../journal/pim-journal.js";
import { Inject } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { PimIdGenerator } from "../../../infra/id/pim-id-generator.js";
import {
  CategoryArchivedError,
  CategoryNotFoundError,
} from "../../category/domain/errors/category-errors.js";
import { CategoryRepository } from "../../category/domain/ports/category.repository.js";
import { EditorialRepository } from "../domain/ports/editorial.repository.js";
import { NutritionRepository } from "../domain/ports/nutrition.repository.js";
import { ProductRepository, type ProductKind } from "../domain/ports/product.repository.js";
import {
  proposeProductSku,
  proposeSku,
  variantSkuRoot,
  type SkuAvailability,
} from "../domain/services/sku-generator.js";
import {
  localizedText,
  type LocalizedText,
} from "../../shared/domain/value-objects/localized-text.js";
import {
  editorial,
  isEmptyEditorial,
  mediaItems,
  type EditorialInput,
  type MediaInput,
} from "../domain/value-objects/editorial.js";
import {
  nutritionDeclaration,
  type NutritionValues,
} from "../domain/value-objects/nutrition-declaration.js";
import { Sku } from "../domain/value-objects/sku.value-object.js";
import { SKU_AVAILABILITY } from "../infrastructure/prisma-sku-availability.js";
import { Product } from "../domain/entities/product.js";

export interface CreateProductInput {
  /** Le nom, dans les langues renseignées — la source est obligatoire. Une
   *  CARTE et non `nameFr` + `nameEn` : ouvrir une langue ne doit pas ajouter un
   *  champ ici, ni chez les quatre autres commandes qui portaient les mêmes. */
  readonly name: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
  /**
   * Laissé vide, une référence opaque `P-XXXXXX` est **proposée**. Renseigné, il permet
   * de reprendre une référence existante (reprise de l'ancien catalogue, format imposé).
   */
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

export class CreateProductCommand {
  constructor(readonly input: CreateProductInput) {}
}

/**
 * Crée le produit **et sa déclinaison par défaut** — indissociables (invariant 2).
 * La persistance les écrit en une transaction : l'invariant n'est jamais faux.
 */
@CommandHandler(CreateProductCommand)
export class CreateProductHandler implements ICommandHandler<CreateProductCommand, string> {
  constructor(
    private readonly products: ProductRepository,
    private readonly categories: CategoryRepository,
    private readonly nutrition: NutritionRepository,
    private readonly editorials: EditorialRepository,
    private readonly journal: PimJournal,
    @Inject(PimIdGenerator) private readonly ids: PimIdGenerator,
    @Inject(SKU_AVAILABILITY) private readonly availability: SkuAvailability,
  ) {}

  async execute(command: CreateProductCommand): Promise<string> {
    const { input } = command;
    const name = localizedText("nom", input.name);
    const category = await this.categories.findById(input.categoryId);

    if (category === null) {
      throw new CategoryNotFoundError(input.categoryId);
    }
    if (category.isArchived) {
      throw new CategoryArchivedError(input.categoryId);
    }

    const sku =
      input.sku === undefined || input.sku.trim() === ""
        ? await proposeProductSku(() => this.ids.next(), this.availability)
        : Sku.create(input.sku);

    // Validée AVANT toute écriture : une fiche refusée ne doit pas laisser
    // derrière elle un produit à moitié créé.
    const declaration =
      input.allergens === undefined
        ? null
        : nutritionDeclaration(input.allergens, input.mayContain ?? [], input.nutrition ?? {});

    const story = editorial(input.editorial ?? {});
    const visuals = mediaItems(input.media ?? []);

    const productId = this.ids.next();
    const variantId = this.ids.next();
    const variantSku = await proposeSku(variantSkuRoot(sku, 0), this.availability);

    const product = Product.open({
      id: productId,
      sku,
      name,
      kind: input.kind,
      categoryId: input.categoryId,
      defaultVariant: { id: variantId, sku: variantSku, name },
    });
    await this.products.add(product);

    if (declaration !== null) {
      // Dette déclarée (cf. `lint:journal-tracked`) : l'ouverture d'une fiche
      // n'a pas encore de fait nommé. Le motif est ici, greppable.
      await this.nutrition.declare(
        variantId,
        declaration,
        this.journal.untraced(
          "création de fiche — aucun événement métier défini (dette journal-tracked)",
        ),
      );
    }
    // Pas de ligne éditoriale si personne n'a rien écrit (satellite optionnel).
    if (!isEmptyEditorial(story) || visuals.length > 0) {
      await this.editorials.save(
        productId,
        story,
        visuals,
        this.journal.untraced(
          "création de fiche — aucun événement métier défini (dette journal-tracked)",
        ),
      );
    }

    return productId;
  }
}
