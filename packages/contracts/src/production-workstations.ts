import { z } from "zod";

import type { CatalogFamilyView } from "./catalog.js";

/**
 * **Les postes du fournil** — Prod manager › Postes (plan
 * `documentation/fournil/plan-postes-du-fournil.md`, § 3.3 et § 3.8, lot W1),
 * sous `production_workstations` :
 *
 * - `GET admin/production/workstations` → {@link WorkstationsPageView} ;
 * - `POST admin/production/workstations` ← {@link DeclareWorkstationPayload},
 *   `201` et l'identifiant du poste ;
 * - `PUT admin/production/workstations/:id/name` ← {@link RenameWorkstationPayload} ;
 * - `PUT admin/production/workstations/order` ← {@link ReorderWorkstationsPayload} ;
 * - `POST admin/production/workstations/:id/archive` ;
 * - `PUT admin/production/workstations/placements` ← {@link PlaceProductsPayload}.
 *
 * Toutes les écritures sont **par intention** (en-tête `Idempotency-Key`) :
 * rejouer un renommage après celui de quelqu'un d'autre le déferait.
 *
 * Le nom et la référence ne sont bornés ici que pour la forme : c'est la carte
 * des postes (le domaine) qui refuse un nom vide ou trop long, et nomme le cas.
 */
const WORKSTATION_NAME_WIRE_MAX = 200;
const PRODUCT_SKU_WIRE_MAX = 64;
/** Le plus de produits placés d'un geste : « tout ce rayon → ce poste ». */
const PLACED_PRODUCTS_MAX = 2_000;
/** Le plus de postes réordonnés d'un geste. */
const REORDERED_WORKSTATIONS_MAX = 200;

export const declareWorkstationPayloadSchema = z.object({
  name: z.string().max(WORKSTATION_NAME_WIRE_MAX),
});
export type DeclareWorkstationPayload = z.infer<typeof declareWorkstationPayloadSchema>;

export const renameWorkstationPayloadSchema = declareWorkstationPayloadSchema;
export type RenameWorkstationPayload = z.infer<typeof renameWorkstationPayloadSchema>;

export const reorderWorkstationsPayloadSchema = z.object({
  ids: z.array(z.string().min(1)).max(REORDERED_WORKSTATIONS_MAX),
});
export type ReorderWorkstationsPayload = z.infer<typeof reorderWorkstationsPayloadSchema>;

export const placeProductsPayloadSchema = z.object({
  productSkus: z.array(z.string().min(1).max(PRODUCT_SKU_WIRE_MAX)).min(1).max(PLACED_PRODUCTS_MAX),
  /** `null` : remis « à ranger ». */
  workstationId: z.string().min(1).nullable(),
});
export type PlaceProductsPayload = z.infer<typeof placeProductsPayloadSchema>;

/** Un poste en service, dans l'ordre des fiches. */
export interface WorkstationView {
  readonly id: string;
  readonly name: string;
  readonly position: number;
}

/** Une déclinaison d'un produit, pour information sous son produit. */
export interface WorkstationProductVariantView {
  readonly sku: string;
  readonly variantName: string;
  /** La règle même de la vente : vendue aujourd'hui à au moins une clientèle. */
  readonly sellable: boolean;
}

/** Un produit de la page Postes, et son poste. */
export interface WorkstationProductView {
  readonly productSku: string;
  /** `null` : le référentiel n'a pas envoyé de nom de fiche — l'écran dit la déclinaison. */
  readonly productName: string | null;
  /** Son rayon de boutique ; `null` : le produit n'est plus au miroir (placé, puis retiré). */
  readonly family: CatalogFamilyView | null;
  /** `null` : « à ranger ». */
  readonly workstationId: string | null;
  /** Commandé ces jours-ci : une journée arrêtée récente, ou la demande à venir. */
  readonly ordered: boolean;
  readonly variants: readonly WorkstationProductVariantView[];
}

/** Un SKU commandé que le commerce ne connaît plus : il ne peut pas recevoir de poste. */
export interface OffCatalogArticleView {
  readonly sku: string;
  readonly productName: string;
}

export interface WorkstationsPageView {
  readonly workstations: readonly WorkstationView[];
  readonly products: readonly WorkstationProductView[];
  readonly offCatalog: readonly OffCatalogArticleView[];
  /** Les produits sans poste — le compte du filtre « à ranger ». */
  readonly unplacedCount: number;
}
