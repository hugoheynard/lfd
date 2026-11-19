import { Injectable } from "@nestjs/common";

import { AllCategoriesReader } from "../../category/domain/ports/all-categories.reader.js";
import { AllProductsReader } from "../../product/domain/ports/all-products.reader.js";
import { EffectiveVatReader } from "../../product/domain/ports/effective-vat.reader.js";
import { isLiveStatus } from "../../product/domain/ports/product.repository.js";
import { EditorialReader } from "../../product/domain/ports/editorial-reader.js";
import { ReadinessReader } from "../../product/domain/ports/readiness.reader.js";
import type { VariantNutritionView } from "../../product/domain/ports/product.repository.js";
import { CatalogRevisionSource } from "../domain/ports/catalog-revision.source.js";
import type { RevisionItemInput, RevisionMedia } from "../domain/revision.js";
import type { ProductMediaRecord } from "../../product/domain/ports/editorial-reader.js";
import type { VariantSnapshot } from "../../product/domain/entities/variant.js";

/**
 * La matière d'une révision, lue en LOT.
 *
 * Trois lectures pour tout le catalogue, jamais une par produit : une capture
 * touche les quatre-vingt-douze fiches d'un coup, et une boucle d'appels y
 * coûterait autant d'allers-retours que d'articles.
 *
 * Les visuels se lisent par la fiche, qui possède leurs rattachements
 * (`EditorialReader.mediaOfProducts`) : la révision ne lit aucune table d'un
 * voisin.
 */
@Injectable()
export class PrismaCatalogRevisionSource extends CatalogRevisionSource {
  constructor(
    private readonly products: AllProductsReader,
    private readonly categories: AllCategoriesReader,
    private readonly vat: EffectiveVatReader,
    private readonly editorials: EditorialReader,
    private readonly readiness: ReadinessReader,
  ) {
    super();
  }

  async snapshotItems(): Promise<readonly RevisionItemInput[]> {
    // Une fiche archivée ou supprimée ne part sur aucun canal : elle n'entre
    // pas dans la révision.
    const products = (await this.products.all())
      .filter((product) => isLiveStatus(product.status))
      .map((product) => product.snapshot());
    if (products.length === 0) {
      return [];
    }
    const ids = products.map((product) => product.id);
    const [categories, vatByProduct, editorials, mediaByProduct, signatures] = await Promise.all([
      this.categories.all(),
      this.vat.vatPercents(products),
      this.editorials.findByProducts(ids),
      this.editorials.mediaOfProducts(ids),
      this.readiness.readMany(ids),
    ]);
    // Une famille archivée ne nomme plus ses fiches dans la révision.
    const categoryName = new Map(
      categories
        .filter((category) => !category.isArchived)
        .map((category) => [category.id, category.name]),
    );

    return products.flatMap((product) => {
      const vat = vatByProduct.get(product.id) ?? {};
      const editorial = editorials.get(product.id) ?? null;
      const media = mediaOfAnchor(mediaByProduct.get(product.id) ?? []);
      // La signature est portée par le PRODUIT : ses déclinaisons partagent
      // donc la même, ce qui est exact — on valide une fiche, pas un article.
      const signed = signatures.get(product.id) ?? null;
      return product.variants.map((variant) => ({
        sku: variant.sku,
        productId: product.id,
        productSku: product.sku,
        name: product.name,
        variantName: variant.name,
        kind: product.kind,
        status: product.status,
        categoryId: product.categoryId,
        categoryName: categoryName.get(product.categoryId) ?? {},
        priceCents: variant.priceCents,
        weightGrams: variant.weightGrams,
        // Absent sans saisie : voir `RevisionItemInput.proPriceMillicents`.
        ...(variant.proPriceMillicents === null
          ? {}
          : { proPriceMillicents: variant.proPriceMillicents }),
        ...(variant.proPricePerKgMillicents === null
          ? {}
          : { proPricePerKgMillicents: variant.proPricePerKgMillicents }),
        ...(variant.publicPricePerKgTtcCents === null
          ? {}
          : { publicPricePerKgTtcCents: variant.publicPricePerKgTtcCents }),
        ...(variant.pricePerKgShownPublic ? {} : { pricePerKgShownPublic: false as const }),
        ...(variant.pricePerKgShownPro ? {} : { pricePerKgShownPro: false as const }),
        ...weightTermsOf(variant),
        isDefault: variant.isDefault,
        isDiscontinued: variant.isDiscontinued,
        // La moitié « sécurité » est un objet depuis le lot 7 ; l'ancre, elle,
        // ne photographie que les codes DÉCLARÉS — sa forme ne bouge pas, et
        // toucher au tableau d'un article rebasculerait son empreinte.
        allergens: variant.allergenSheet === null ? null : [...variant.allergenSheet.declared],
        nutrition: nutritionOf(variant.nutrition),
        vatByContext: { ...vat },
        editorial: editorial === null ? null : { ...editorial },
        media,
        readyAt: signed === null ? null : signed.readyAt.toISOString(),
        readyBy: signed?.readyBy ?? null,
      }));
    });
  }
}

/**
 * Les valeurs nutritionnelles d'une ancre, **dans l'ordre de l'annexe XV**.
 *
 * `null` quand AUCUNE n'est renseignée, et pas un objet de huit `null` : la
 * moitié allergènes et la moitié nutrition vivent désormais dans deux tables,
 * et l'instantané porte un bloc dès que l'une des deux existe. Sans cette
 * réduction, déclarer un allergène changerait l'empreinte nutritionnelle d'un
 * article dont personne n'a saisi une valeur.
 */
function nutritionOf(
  values: VariantNutritionView | null,
): Readonly<Record<string, number | null>> | null {
  if (values === null) {
    return null;
  }
  const declared = {
    energyKcal: values.energyKcal,
    fatG: values.fatG,
    saturatedFatG: values.saturatedFatG,
    carbsG: values.carbsG,
    sugarsG: values.sugarsG,
    proteinG: values.proteinG,
    saltG: values.saltG,
    glycemicIndex: values.glycemicIndex,
  };
  return Object.values(declared).every((value) => value === null) ? null : declared;
}

/**
 * La vente au poids, telle que l'ancre la photographie : rien à la pièce (les
 * empreintes de l'existant ne bougent pas), l'unité et ce qui est saisi au
 * poids. Voir `RevisionItemInput.saleUnit`.
 */
function weightTermsOf(
  variant: Pick<VariantSnapshot, "saleUnit" | "weightMinGrams" | "weightStepGrams">,
): {
  saleUnit?: "weight";
  weightMinGrams?: number;
  weightStepGrams?: number;
} {
  if (variant.saleUnit !== "weight") {
    return {};
  }
  return {
    saleUnit: "weight",
    ...(variant.weightMinGrams === null ? {} : { weightMinGrams: variant.weightMinGrams }),
    ...(variant.weightStepGrams === null ? {} : { weightStepGrams: variant.weightStepGrams }),
  };
}

/**
 * Les visuels d'une ancre : rôle, ADRESSE et alternative, dans l'ordre
 * d'affichage — jamais les octets, qui vivent dans le bucket.
 *
 * L'alternative est prise telle que la médiathèque la décrit : on
 * PHOTOGRAPHIE, et une alternative absente doit le rester dans l'ancre. Un
 * rattachement sans image n'est pas rendu par la fiche, donc n'entre pas
 * dans l'empreinte plutôt que d'y entrer à moitié.
 */
function mediaOfAnchor(records: readonly ProductMediaRecord[]): RevisionMedia[] {
  return records.map((record) => ({ role: record.role, url: record.url, alt: record.alt }));
}
