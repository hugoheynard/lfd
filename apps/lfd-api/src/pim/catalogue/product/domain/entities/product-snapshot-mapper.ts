import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import type { VariantSnapshot } from "./variant.js";
import type { LocalizedText } from "../../../shared/domain/value-objects/localized-text.js";
import { ProductCommerceOptions } from "../value-objects/product-commerce-options.js";
import { VatByContext } from "../value-objects/vat-by-context.js";
import {
  slugOf,
  type NewProductInput,
  type ProductKind,
  type ProductSnapshot,
  type ProductStatus,
} from "./product-state.js";

/**
 * Tout ce que la fiche porte HORS déclinaisons, sous sa forme de domaine : les
 * réglages de vente et la dérogation de TVA sont des objets, pas des champs.
 */
export interface ProductFields {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
  readonly status: ProductStatus;
  readonly vat: VatByContext;
  readonly options: ProductCommerceOptions;
  readonly originVariantId: string | null;
}

/**
 * Relit les champs d'une fiche depuis son instantané.
 *
 * Les champs facultatifs à la LECTURE (`variantsAsTiles`, `originVariantId`)
 * reprennent la valeur de toute fiche — l'agrégat, lui, les rend toujours.
 */
export function productFieldsFrom(snapshot: ProductSnapshot): ProductFields {
  return {
    id: snapshot.id,
    sku: snapshot.sku,
    name: snapshot.name,
    slug: snapshot.slug,
    kind: snapshot.kind,
    categoryId: snapshot.categoryId,
    status: snapshot.status,
    vat: VatByContext.reconstitute(snapshot.vatByContext),
    options: ProductCommerceOptions.of({
      operationOnly: snapshot.operationOnly,
      requiresCold: snapshot.requiresCold,
      audience: snapshot.audience,
      variantsAsTiles: snapshot.variantsAsTiles ?? true,
    }),
    originVariantId: snapshot.originVariantId ?? null,
  };
}

/**
 * L'instantané d'une fiche : ses champs et les déclinaisons qu'on lui donne.
 *
 * Le mapper ne choisit pas entre l'instantané RÉSOLU (lu par les canaux, la
 * révision, la parité) et celui qu'on PERSISTE (ce que chaque déclinaison
 * porte, héritage non résolu) : l'agrégat lui passe celui qu'il veut, et la
 * forme ne varie pas. Écrire le résolu dans les colonnes propres recopierait le
 * défaut chez les alignées et détruirait ce qu'elles avaient.
 */
export function productSnapshot(
  fields: ProductFields,
  variants: readonly VariantSnapshot[],
): ProductSnapshot {
  return {
    id: fields.id,
    sku: fields.sku,
    name: fields.name,
    slug: fields.slug,
    kind: fields.kind,
    categoryId: fields.categoryId,
    status: fields.status,
    vatByContext: fields.vat.toMap(),
    operationOnly: fields.options.operationOnly,
    requiresCold: fields.options.requiresCold,
    audience: fields.options.audience,
    originVariantId: fields.originVariantId,
    variantsAsTiles: fields.options.variantsAsTiles,
    variants: [...variants],
  };
}

/**
 * Les champs d'une fiche qu'on OUVRE : INVISIBLE (brouillon, ce qui rend
 * l'invariant 7 tenable), sans dérogation de TVA, avec les réglages de base.
 */
export function openedFields(input: NewProductInput): ProductFields {
  return {
    id: input.id,
    sku: input.sku.value,
    name: input.name,
    slug: slugOf(input.name),
    kind: input.kind,
    categoryId: input.categoryId,
    status: "draft",
    vat: VatByContext.none(),
    options: ProductCommerceOptions.initial(),
    originVariantId: null,
  };
}

/**
 * Les champs d'une fiche **née d'un détachement** : le nom de la déclinaison,
 * la famille, le genre, la TVA et les réglages de la fiche d'origine (copiés,
 * jamais partagés), et brouillon — un produit neuf n'a jamais été relu sous sa
 * nouvelle référence.
 *
 * L'audience est celle que la déclinaison portait en propre, sinon celle que
 * la fiche d'origine POSE (`null` compris : la fiche neuve suit sa famille) —
 * jamais l'audience effective, qui figerait toute fiche détachée
 * (`plan-audience-par-declinaison.md`, AD1).
 */
export function detachedFields(
  origin: ProductFields,
  born: {
    readonly id: string;
    readonly sku: string;
    readonly name: LocalizedText;
    readonly audience: Audience | null;
  },
  variantId: string,
): ProductFields {
  return {
    id: born.id,
    sku: born.sku,
    name: born.name,
    slug: slugOf(born.name),
    kind: origin.kind,
    categoryId: origin.categoryId,
    status: "draft",
    vat: origin.vat.copy(),
    options: origin.options.forDetachedProduct(born.audience),
    originVariantId: variantId,
  };
}
