import type { Prisma } from "../../../platform/database/client/client.js";

/**
 * **Les colonnes que l'instantané du catalogue lira, contexte par contexte et
 * table par table** — et EXACTEMENT celles qui font monter la ligne du
 * contexte dans `context_versions`
 * (`documentation/caching-usage/le-catalogue-en-memoire.md`, § 2.2, § 11,
 * lot M1a).
 *
 * Le premier niveau est le contexte propriétaire de la table (celui de
 * `lint:prisma-model-ownership`, revérifié le 2026-11-06 sur les écrivains :
 * `lafoliecoffee/catalog`, `lafoliecoffee/operations`, `lafoliecoffee/order-cutoffs`). Le déclencheur d'une
 * table appelle la fonction de montée de CE contexte ; la porte
 * `lint:context-version-columns` refuse qu'une table rangée ici fasse monter
 * un autre contexte.
 *
 * Une seule liste pour deux usages : le chargeur de M1b construira son
 * `select` à partir d'elle, et les déclencheurs `UPDATE OF …` de la migration
 * `20261106120000_les_versions_par_contexte` la recopient. La porte refuse
 * qu'elles divergent, et refuse toute colonne du schéma qui n'est ni ici ni
 * écartée, raison écrite, dans `catalogue-snapshot-registry.json`.
 *
 * Une colonne oubliée ici servirait un état faux sans le dire (un article
 * masqué encore servi, un prix d'avant) ; une colonne de trop ne coûte qu'un
 * rechargement. Dans le doute, elle entre.
 *
 * Relevé le 2026-11-05 dans les lecteurs que l'instantané remplacera :
 * `prisma-catalog.reader.ts` (`ItemRow`, `servedItem`, la lignée),
 * `catalog-item-access.ts` (le mur : audience, revues, sur mesure, masquages,
 * visibilité réservée, compteur de réservations), le prix au kilo, la
 * classification des lignes, la filiation, les opérations
 * (`catalog-operation-rows.ts`, `hidden`, `showsOrderUntilTime`), l'heure
 * limite générale.
 *
 * `order_cutoff_settings` — relevé le 2026-11-06 depuis les appelants du devis
 * et de l'estimation, PAS depuis le lecteur des écrans (qui lit la ligne
 * entière) : `OrderPlanGate.ensureNotTooSoon` et `ShelfCircuit.refusalFor`
 * jugent `sameDayOpenTo` (jour même public, pro, pro en ligne) ;
 * `staff-settlement-refusal.ts` (estimation pour un client) juge
 * `sameDayProWithoutCredit` par `ShelfCircuit.refusesWithoutCredit`. L'heure de
 * réassort n'y sert pas (réassort et plan du fournil seulement).
 *
 * Les noms sont ceux de Prisma (le `select` de M1b) ; la porte les traduit en
 * colonnes SQL par les `@map` du schéma.
 */
export const CATALOGUE_SNAPSHOT_COLUMNS = {
  catalog: {
    catalog_items: [
      "sku",
      "productId",
      "productSku",
      "name",
      "categoryId",
      "priceMillicents",
      "isDefault",
      "position",
      "vatRatePercent",
      "proPricePerKgMillicents",
      "publicPricePerKgTtcCents",
      "saleUnit",
      "weightMinGrams",
      "weightStepGrams",
      "proMinQuantity",
      "publicMinQuantity",
      "publicByContext",
      "allergens",
      "allergenLabels",
      "allergensPrecautionary",
      "allergenTexts",
      "note",
      "nameTranslations",
      "noteTranslations",
      "imageUrl",
      "imageAlt",
      "imageWidth",
      "imageHeight",
      "imageFocalX",
      "imageFocalY",
      "thumbnailUrl",
      "thumbnailAlt",
      "thumbnailWidth",
      "thumbnailHeight",
      "thumbnailFocalX",
      "thumbnailFocalY",
      "orderLimitDaysBefore",
      "orderLimitTime",
      "orderLimitGraceMinutes",
      "withdrawnAt",
      "operationOnly",
      "variantsAsTiles",
      "productName",
      "customRecipe",
      "detachedFromSku",
      "detachedFromVariantSku",
      "audience",
      "publicReviewPending",
      "proReviewPending",
    ],
    catalog_categories: ["id", "name", "nameTranslations", "slug", "parentId", "position"],
    catalog_item_overrides: [
      "sku",
      "isHidden",
      "isHiddenPublic",
      "isFeaturedPro",
      "isFeaturedPublic",
      "reservedVisibility",
    ],
    catalog_item_reservations: ["sku", "companyId"],
  },
  operations: {
    catalog_operations: [
      "key",
      "name",
      "lede",
      "imageUrl",
      "imageAlt",
      "imageFocalX",
      "imageFocalY",
      "announceFrom",
      "orderFrom",
      "orderUntil",
      "pickupFrom",
      "pickupUntil",
      "showsOrderUntilTime",
      "audience",
      "receivedAt",
      "withdrawnAt",
      "hidden",
    ],
    catalog_operation_items: ["operationKey", "sku", "position"],
  },
  order_cutoffs: {
    order_cutoffs: ["id", "pickupAddressId", "weekday", "daysBefore", "time", "graceMinutes"],
    order_cutoff_settings: [
      "key",
      "sameDayPublicAllowed",
      "sameDayProAllowed",
      "sameDayProOnline",
      "sameDayProWithoutCredit",
    ],
  },
} as const satisfies {
  readonly catalog: {
    readonly catalog_items: readonly Prisma.CatalogItemScalarFieldEnum[];
    readonly catalog_categories: readonly Prisma.CatalogCategoryScalarFieldEnum[];
    readonly catalog_item_overrides: readonly Prisma.CatalogItemOverrideScalarFieldEnum[];
    readonly catalog_item_reservations: readonly Prisma.CatalogItemReservationScalarFieldEnum[];
  };
  readonly operations: {
    readonly catalog_operations: readonly Prisma.CatalogOperationScalarFieldEnum[];
    readonly catalog_operation_items: readonly Prisma.CatalogOperationItemScalarFieldEnum[];
  };
  readonly order_cutoffs: {
    readonly order_cutoffs: readonly Prisma.OrderCutoffScalarFieldEnum[];
    readonly order_cutoff_settings: readonly Prisma.OrderCutoffSettingsScalarFieldEnum[];
  };
};

/** Un contexte versionné : une ligne de `context_versions`. */
export type VersionedContext = keyof typeof CATALOGUE_SNAPSHOT_COLUMNS;
