import {
  slugify,
  type LocalizedText,
} from "../../../shared/domain/value-objects/localized-text.js";
import type { ContextVat } from "../../../shared/domain/value-objects/context-vat.js";
import type { Audience } from "../../../shared/domain/value-objects/audience.js";
import type { Sku } from "../value-objects/sku.value-object.js";
import type { VariantSnapshot } from "./variant.js";

export type ProductKind = "daily" | "made_to_order" | "resale";
/**
 * `deleted` : une fiche archivée qu'on a **supprimée** — elle disparaît de tout
 * le référentiel, archives comprises, mais la ligne reste en base et son SKU
 * reste pris (`documentation/pim/plan-effacer-une-fiche-archivee.md`, v4). Un
 * soft delete, parce que le dépôt n'efface pas un agrégat métier.
 */
export type ProductStatus = "draft" | "published" | "archived" | "deleted";

/**
 * La fiche est-elle **vivante** — brouillon ou en ligne ? Une archivée est
 * sortie du catalogue, une supprimée de tout. La définition vit ici pour que
 * chaque lecteur qui écartait `archived` écarte aussi `deleted` sans réécrire
 * la liste.
 */
export function isLiveStatus(status: ProductStatus): boolean {
  return status === "draft" || status === "published";
}

/**
 * Ce qu'un verbe de cycle de vie a **réellement** fait.
 *
 * `false` = le produit y était déjà. Il n'y a alors rien à écrire, et surtout
 * **rien à journaliser** : le journal est la trace d'audit, et un fait
 * `product.unpublished` sur une fiche qui n'était pas en vente est un fait qui
 * n'a pas eu lieu. Trois des quatre verbes journalisaient inconditionnellement
 * (audit 2026-09-01).
 *
 * À distinguer d'une transition **impossible**, qui lève : « il y était déjà »
 * est un non-événement, « ça n'a pas de sens » est une erreur d'appelant.
 */
export type StatusChanged = boolean;

export interface ProductSnapshot {
  readonly id: string;
  readonly sku: string;
  readonly name: LocalizedText;
  readonly slug: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
  readonly status: ProductStatus;
  readonly variants: readonly VariantSnapshot[];
  /**
   * Les taux propres à CE produit, par clé de contexte — sa **dérogation** à sa
   * famille. Clé absente = il hérite, et c'est le cas courant.
   */
  readonly vatByContext: ContextVat;
  /**
   * **Vendu seulement pendant une opération** — la bûche, pas le croissant
   * (D3 de `documentation/operations-datees/architecture-operations-datees.md`).
   *
   * Un fait de la FICHE et non de la ligne d'opération : retirer la bûche de
   * Noël, masquer ou archiver Noël doit la rendre invisible, jamais la vendre
   * toute l'année.
   */
  readonly operationOnly: boolean;
  /**
   * **Demande le froid** — se conserve au réfrigérateur (lot 4 bis du plan de
   * préparation de tournée, v2-2). La livraison ne le charge qu'en bac
   * isotherme.
   *
   * `false` n'affirme rien : c'est l'état de toute fiche tant que personne n'a
   * dit qu'elle était froide, pas une déclaration « se conserve au sec ».
   */
  readonly requiresCold: boolean;
  /**
   * À qui la fiche vend quand elle ne suit pas sa famille. `null` = elle
   * hérite (C2 du plan `plan-catalogue-synchronise-par-audience.md`).
   */
  readonly audience: Audience | null;
  /**
   * La déclinaison dont il est né par détachement (`plan-gestes-de-declinaison.md`,
   * G2) ; `null` = né d'une création. Facultatif à la LECTURE (absent = `null`),
   * comme `VariantSnapshot.detachedToProductId` : l'agrégat le rend toujours.
   */
  readonly originVariantId?: string | null | undefined;
  /**
   * **Montrer chaque déclinaison en vignette** au rayon de la boutique
   * (`plan-declinaisons-en-vignette.md`, V1) ; `false` = seule la déclinaison
   * par défaut. Facultatif à la LECTURE (absent = `true`, la valeur de toute
   * fiche) : l'agrégat le rend toujours.
   */
  readonly variantsAsTiles?: boolean | undefined;
}

/**
 * Ouvrir un produit, c'est ouvrir **sa déclinaison par défaut avec lui**.
 * Les créer séparément ouvrirait une fenêtre où l'invariant 2 est faux.
 */
export interface NewProductInput {
  readonly id: string;
  readonly sku: Sku;
  readonly name: LocalizedText;
  readonly kind: ProductKind;
  readonly categoryId: string;
  readonly defaultVariant: { readonly id: string; readonly sku: Sku; readonly name: LocalizedText };
}

/**
 * Ce que {@link Product.makeVariantDefault} rend à son appelant : l'ancien
 * défaut, pour le journal, et les moitiés de fiche que la nouvelle a reçues en
 * propre — la fiche réglementaire s'écrit par ses ports, pas par `save`.
 */
export interface DefaultVariantChange {
  readonly previousDefaultId: string;
  readonly inherited: { readonly allergens: boolean; readonly nutrition: boolean };
}

/** Le slug d'un produit — dérivé du nom, jamais saisi. */
export function slugOf(name: LocalizedText): LocalizedText {
  return name.en === undefined
    ? { fr: slugify(name.fr) }
    : { fr: slugify(name.fr), en: slugify(name.en) };
}
