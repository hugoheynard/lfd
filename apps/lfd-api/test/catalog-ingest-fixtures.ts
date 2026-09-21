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

/**
 * **L'étiquette publique que ce jeu de fixtures pousse sur TOUS ses articles.**
 *
 * Une suite qui décrit la vitrine publique a besoin de nommer ce qu'elle
 * attend : sans ça, `236_967` traîne en littéral dans une dizaine de fichiers,
 * et le jour où l'étiquette change, il faut deviner lesquels parlent d'elle.
 *
 * 🔴 **`htMillicents` n'est PAS recalculé ici**, et c'est volontaire : une
 * fixture qui dérive avec la même fonction que le code testé ne peut plus le
 * contredire. Le nombre est posé ; `pim-contracts` a ses propres tests pour
 * prouver que 2,50 € à 5,5 % font bien 236 967 millicentimes.
 */
export const PUBLIC_LABEL = {
  contextKey: "takeaway",
  ttcCents: 250,
  vatRatePercent: 5.5,
  htMillicents: 236_967,
} as const;

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
  /**
   * **L'étiquette publique de cet article** — par défaut `PUBLIC_LABEL`.
   *
   * Une suite la pose quand ses nombres doivent être lisibles (un devis public
   * dont on relit la TVA à la main) ou quand elle a besoin de DEUX taux
   * publics : le défaut est unique, et un catalogue à un seul taux ne compose
   * pas de facture.
   */
  readonly publicPrice?: {
    ttcCents: number;
    vatRatePercent: number;
    htMillicents: number;
  };
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
        publicPrice = PUBLIC_LABEL,
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
            // ⚠️ Volontairement SANS rapport arithmétique avec `priceMillicents` :
            // celui-ci est le prix PRO, celui-là l'étiquette publique. Une
            // fixture où les deux se déduiraient l'un de l'autre laisserait
            // passer une confusion entre les deux.
            publicTtcCents: publicPrice.ttcCents,
            publicByContext: {
              [PUBLIC_LABEL.contextKey]: {
                vatRatePercent: publicPrice.vatRatePercent,
                htMillicents: publicPrice.htMillicents,
              },
            },
            allergens: allergens === null ? null : [...allergens],
            allergenLabels,
          },
        ],
      }),
    ),
    orderTimeLimits: [...orderTimeLimits],
  };
}
