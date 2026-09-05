import {
  CATALOG_SNAPSHOT_VERSION,
  type CatalogSnapshot,
  type SyncOrderTimeLimitRule,
} from "@lfd/catalog-sync";

/**
 * **Le snapshot que les suites d'ingestion poussent**, et rien d'autre.
 *
 * Extrait de `catalog-ingest.e2e-spec.ts` en le scindant : deux suites y
 * poussent le même catalogue pour observer deux choses différentes — ce que
 * l'ingestion ÉCRIT, et ce que chaque fait TRANSPORTE. Recopier la fabrique
 * aurait suffi à les laisser diverger, et la divergence se serait vue comme un
 * test qui échoue sans que son sujet ait bougé.
 *
 * Ce fichier n'est pas une suite (`.ts`, pas `.e2e-spec.ts`) : `lint:e2e-durations`
 * mesure les suites du disque, et un fichier de fixtures ne s'exécute pas seul.
 */

export const CATEGORY = {
  id: "cat_vien",
  name: "Viennoiseries",
  slug: "viennoiseries",
  parentId: null,
  position: 0,
  vatRatePercent: 5.5,
};

/** Ce qu'une suite décrit d'un article — le reste a des défauts qui ne surprennent pas. */
export interface IngestedSku {
  readonly sku: string;
  readonly priceMillicents: number;
  readonly vatRatePercent?: number | null;
  readonly allergens?: readonly string[] | null;
  /** Les mentions déjà projetées par le PIM (v5 du fil). */
  readonly allergenLabels?: {
    labels: { category: string; label: string }[];
    incomplete: boolean;
  } | null;
  /** La vitrine (v8) — absente par défaut, comme sur une fiche sans éditorial. */
  readonly note?: string | null;
  readonly image?: {
    url: string;
    alt: string;
    width: number | null;
    height: number | null;
  } | null;
}

/**
 * Un snapshot complet, à partir de la seule liste des articles.
 *
 * L'échelle des limites est **vide par défaut**, comme sur la quasi-totalité du
 * catalogue : les suites qui l'éprouvent la passent explicitement, ce qui rend
 * le sujet du test lisible depuis son appel.
 */
export function snapshotOf(
  skus: readonly IngestedSku[],
  orderTimeLimits: readonly SyncOrderTimeLimitRule[] = [],
): CatalogSnapshot {
  return {
    version: CATALOG_SNAPSHOT_VERSION,
    generatedAt: "2026-08-17T08:00:00.000Z",
    categories: [CATEGORY],
    products: skus.map(
      ({
        sku,
        priceMillicents,
        vatRatePercent = 5.5,
        allergens = ["AW"],
        allergenLabels = null,
        note = null,
        image = null,
      }) => ({
        id: `prd_${sku}`,
        sku,
        name: `Produit ${sku}`,
        categoryId: CATEGORY.id,
        kind: "daily" as const,
        note,
        image,
        variants: [
          {
            id: `var_${sku}`,
            sku: `${sku}-1`,
            name: `Produit ${sku}`,
            priceMillicents,
            weightGrams: null,
            isDefault: true,
            position: 0,
            vatRatePercent,
            allergens: allergens === null ? null : [...allergens],
            allergenLabels,
          },
        ],
      }),
    ),
    orderTimeLimits: [...orderTimeLimits],
  };
}
