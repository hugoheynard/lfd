import { z } from "zod";

import type { CatalogFamilyView } from "./catalog.js";
import { serviceDaySchema } from "./day-version.js";
import {
  PRODUCTION_GROUPINGS,
  PRODUCTION_TRACKING_LEVELS,
  type ProductionGrouping,
  type ProductionTrackingLevel,
} from "./production-settings.js";
import type { WorkshopGroupKind, WorkshopLineRole } from "./production-worksheet.js";

/**
 * **Les postes du fournil** — Prod manager › Postes (plan
 * `documentation/fournil/les-postes-du-fournil.md`, § 3.3 et § 3.8, lot W1),
 * sous `production_workstations` :
 *
 * - `GET admin/production/workstations` → {@link WorkstationsPageView} ;
 * - `POST admin/production/workstations` ← {@link DeclareWorkstationPayload},
 *   `201` et l'identifiant du poste ;
 * - `PUT admin/production/workstations/:id/name` ← {@link RenameWorkstationPayload} ;
 * - `PUT admin/production/workstations/order` ← {@link ReorderWorkstationsPayload} ;
 * - `POST admin/production/workstations/:id/archive` ;
 * - `PUT admin/production/workstations/placements` ← {@link PlaceProductsPayload} ;
 * - `POST admin/production/workstations/:id/products` ←
 *   {@link WorkstationProductsPayload} — ce poste de plus pour ces produits ;
 * - `POST admin/production/workstations/:id/products/removal` ←
 *   {@link WorkstationProductsPayload} — ce poste quitte ces produits ;
 * - `PUT admin/production/workstations/:id/finishing` ←
 *   {@link SetFinishingWorkstationPayload} — ce poste finit ce produit ;
 * - `PUT admin/production/workstations/:id/products/order` ←
 *   {@link ReorderWorkstationProductsPayload} — la pile du poste ;
 * - `PUT admin/production/workstations/:id/tracking-level` ←
 *   {@link SetWorkstationTrackingLevelPayload} (`fournil/les-niveaux-de-suivi.md`) ;
 * - `POST admin/production/workstations/grouping` ← {@link ProductionGroupingPayload}
 *   → {@link ProductionGroupingView} — une LECTURE en `POST`, sous
 *   `production_plan:read` ou `production_resupply:read` (§ 3.7) ;
 * - `GET admin/production/workstations/unplaced?date=AAAA-MM-JJ` →
 *   {@link UnplacedProductsOfDayView}, sous `production_plan:read` (§ 3.10).
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

/**
 * Un poste de plus pour des produits, ou un poste qui les quitte
 * (`fournil/un-produit-sur-plusieurs-postes.md`, § 2.1). Le premier poste
 * d'un produit le finit ; on ne retire pas celui qui finit tant qu'il en
 * reste d'autres — la carte le refuse et dit quoi faire.
 */
export const workstationProductsPayloadSchema = z
  .object({
    productSkus: z
      .array(z.string().min(1).max(PRODUCT_SKU_WIRE_MAX))
      .min(1)
      .max(PLACED_PRODUCTS_MAX),
  })
  .strict();
export type WorkstationProductsPayload = z.infer<typeof workstationProductsPayloadSchema>;

/** Le poste de la route finit désormais ce produit : il doit déjà en être un poste. */
export const setFinishingWorkstationPayloadSchema = z
  .object({ productSku: z.string().min(1).max(PRODUCT_SKU_WIRE_MAX) })
  .strict();
export type SetFinishingWorkstationPayload = z.infer<typeof setFinishingWorkstationPayloadSchema>;

/**
 * La pile d'un poste : exactement ses produits (références produit), chacun
 * une fois, du haut vers le bas. Un poste porte au plus les produits d'un
 * geste de placement.
 */
export const reorderWorkstationProductsPayloadSchema = z.object({
  skus: z.array(z.string().min(1).max(PRODUCT_SKU_WIRE_MAX)).max(PLACED_PRODUCTS_MAX),
});
export type ReorderWorkstationProductsPayload = z.infer<
  typeof reorderWorkstationProductsPayloadSchema
>;

/**
 * Le niveau de suivi propre à un poste ; `null` : le poste suit le fournil.
 * Il vaut à partir de la prochaine journée arrêtée.
 */
export const setWorkstationTrackingLevelPayloadSchema = z
  .object({ trackingLevel: z.enum(PRODUCTION_TRACKING_LEVELS).nullable() })
  .strict();
export type SetWorkstationTrackingLevelPayload = z.infer<
  typeof setWorkstationTrackingLevelPayloadSchema
>;

/**
 * `GET admin/production/simulation.pdf?mode=…&showSubcategories=…`
 * — le mode dans lequel ranger le catalogue simulé, et l'affichage des
 * sous-catégories, quel que soit le réglage du fournil. `showSubcategories`
 * absent : celui du réglage.
 */
export const productionSimulationQuerySchema = z.object({
  mode: z.enum(PRODUCTION_GROUPINGS),
  showSubcategories: z.enum(["true", "false"]).optional(),
});
export type ProductionSimulationQuery = z.infer<typeof productionSimulationQuerySchema>;

/** Un poste en service, dans l'ordre des fiches. */
export interface WorkstationView {
  readonly id: string;
  readonly name: string;
  readonly position: number;
  /**
   * Son niveau de suivi propre (`documentation/fournil/les-niveaux-de-suivi.md`) ; `null` : le poste suit le fournil.
   */
  readonly trackingLevel: ProductionTrackingLevel | null;
}

/** Une déclinaison d'un produit, pour information sous son produit. */
export interface WorkstationProductVariantView {
  readonly sku: string;
  readonly variantName: string;
  /** La règle même de la vente : vendue aujourd'hui à au moins une clientèle. */
  readonly sellable: boolean;
}

/** Un des postes d'un produit. */
export interface WorkstationProductStationView {
  readonly workstationId: string;
  /** Ce poste finit le produit : seul son « Fait » compte des pièces. Un seul par produit. */
  readonly finishes: boolean;
  /**
   * La place du produit dans la pile DE CE POSTE, à partir de 0 ; `null` :
   * jamais réglée — il vient après ceux qui en ont une.
   */
  readonly position: number | null;
}

/** Un produit de la page Postes, et ses postes. */
export interface WorkstationProductView {
  readonly productSku: string;
  /** `null` : le référentiel n'a pas envoyé de nom de fiche — l'écran dit la déclinaison. */
  readonly productName: string | null;
  /** Son rayon de boutique ; `null` : le produit n'est plus au miroir (placé, puis retiré). */
  readonly family: CatalogFamilyView | null;
  /** Le poste qui le finit ; `null` : « à ranger ». */
  readonly workstationId: string | null;
  /**
   * Sa place dans la pile du poste qui le finit, à partir de 0 ; `null` :
   * sans poste, ou jamais réglée — il vient alors après ceux qui en ont une.
   */
  readonly position: number | null;
  /**
   * Tous ses postes, celui qui finit en premier, puis dans l'ordre des
   * fiches ; vide : « à ranger ».
   */
  readonly workstations: readonly WorkstationProductStationView[];
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
  /**
   * Dans l'ordre du catalogue. La pile d'un poste se lit sur `position` :
   * les places réglées, puis les autres dans l'ordre de cette liste.
   */
  readonly products: readonly WorkstationProductView[];
  readonly offCatalog: readonly OffCatalogArticleView[];
  /** Les produits sans poste — le compte du filtre « à ranger ». */
  readonly unplacedCount: number;
}

/**
 * Le plus de SKU qu'un écran fait ranger d'un appel. Mesuré le 2026-11-16 :
 * 99 déclinaisons non retirées au miroir du commerce (`catalog_items`, base de
 * dev semée du référentiel). Cinq fois ce nombre laisse grandir le catalogue
 * sans qu'un écran se mette à recevoir des `400`, et le corps reste vers
 * 35 Ko, loin du plafond des corps JSON (512 Ko). Un écran qui dépasse coupe
 * sa liste : c'est le signe que le catalogue a changé d'échelle.
 */
export const PRODUCTION_GROUPING_SKUS_MAX = 500;

/** `POST admin/production/workstations/grouping` — les SKU à ranger, la forme seulement. */
export const productionGroupingPayloadSchema = z.object({
  skus: z
    .array(z.string().min(1).max(PRODUCT_SKU_WIRE_MAX))
    .min(1)
    .max(PRODUCTION_GROUPING_SKUS_MAX),
});
export type ProductionGroupingPayload = z.infer<typeof productionGroupingPayloadSchema>;

/** L'intertitre d'un SKU dans son groupe : une sous-catégorie, ou le rayon d'un poste. */
export interface ProductionGroupingSectionView {
  /** L'id de la famille ; `null` = la racine du groupe elle-même, sans intertitre. */
  readonly key: string | null;
  readonly label: string | null;
  /** Le rang de l'intertitre dans son groupe, à partir de 0. */
  readonly order: number;
}

/** Où un SKU se range, selon le mode du réglage. */
export interface ProductionGroupingEntryView {
  readonly sku: string;
  /** La clé du groupe : l'id du rayon racine, `ws:<id du poste>`, ou `?`. */
  readonly key: string;
  /** « Viennoiserie », « Pâtisserie », « Traiteur salé — à ranger », « Hors catalogue »… */
  readonly title: string;
  readonly kind: WorkshopGroupKind;
  /** Le rang du groupe, à partir de 0 : les postes, puis les rayons, puis le hors catalogue. */
  readonly order: number;
  /** `null` : le réglage n'affiche pas les intertitres, ou le groupe n'en a pas. */
  readonly section: ProductionGroupingSectionView | null;
  /**
   * Ce que le poste du groupe fait du SKU : `finishes` ou `step` ; `null`
   * hors d'un groupe `workstation`. Facultatif dans le TYPE seulement : le
   * serveur l'envoie toujours.
   */
  readonly role?: WorkshopLineRole | null;
}

/**
 * Le rangement servi au front (§ 3.7) : le prévisionnel, le récapitulatif et
 * les filtres des réassorts du fournil ne rangent plus eux-mêmes.
 */
export interface ProductionGroupingView {
  /** Le mode du réglage, appliqué ici. */
  readonly mode: ProductionGrouping;
  readonly showSubcategories: boolean;
  /** `false` : les rayons n'ont pas pu être lus — tout est en « Rayon inconnu ». */
  readonly shelvesKnown: boolean;
  /** `false` : en mode prod, les postes n'ont pas pu être lus — rangé par rayon. */
  readonly workstationsKnown: boolean;
  /**
   * Dans l'ordre du rangement : un par SKU demandé, et un de plus par poste
   * supplémentaire de son produit en mode prod (une entrée par couple SKU,
   * groupe ; `documentation/fournil/un-produit-sur-plusieurs-postes.md`,
   * § 2.2). Un total général se dédoublonne par SKU.
   */
  readonly entries: readonly ProductionGroupingEntryView[];
}

/** `GET admin/production/workstations/unplaced?date=AAAA-MM-JJ`. */
export const unplacedProductsOfDayQuerySchema = z.object({
  date: serviceDaySchema,
});
export type UnplacedProductsOfDayQuery = z.infer<typeof unplacedProductsOfDayQuerySchema>;

/** Un produit du jour sans poste, et les déclinaisons du jour qui le portent. */
export interface UnplacedProductOfDayView {
  readonly productSku: string;
  /** `null` : le référentiel n'a pas envoyé de nom de fiche — l'écran dit la déclinaison. */
  readonly productName: string | null;
  readonly skus: readonly string[];
}

/**
 * **L'alerte du Prod manager** (§ 3.10) : les produits du jour sans poste. Avant
 * l'arrêt, ceux de la demande attendue du jour (commandes et réassorts) ;
 * après, ceux des lignes arrêtées du jour.
 */
export interface UnplacedProductsOfDayView {
  readonly date: string;
  /** Le mode du réglage : l'alerte ne se montre qu'en mode prod. */
  readonly mode: ProductionGrouping;
  /** `true` : lu sur les lignes arrêtées ; `false` : sur la demande attendue. */
  readonly closed: boolean;
  readonly products: readonly UnplacedProductOfDayView[];
  /** Les SKU du jour que le commerce ne connaît plus : ils ne peuvent pas recevoir de poste. */
  readonly offCatalog: readonly OffCatalogArticleView[];
}
