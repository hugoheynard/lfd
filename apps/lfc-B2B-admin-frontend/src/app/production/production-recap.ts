import {
  CATALOG_CATEGORY_LABELS,
  CATALOG_CATEGORY_ORDER,
  type CatalogCategory,
  type CatalogItemView,
  type ProductionSheet,
} from '@lfd/contracts';

/**
 * La **récapitulation de production** : ce que le lot représente, rayon par
 * rayon puis produit par produit, toutes commandes confondues.
 *
 * C'est l'autre façon de lire la même pile, et c'est celle par laquelle on
 * commence. Une boulangerie ne fabrique pas commande par commande — elle pétrit
 * 240 croissants, puis répartit. Les bons de commande disent la répartition ;
 * ce récapitulatif dit la fabrication. Aucun ne remplace l'autre.
 *
 * **La catégorie vient du catalogue, pas de la commande.** Une ligne de commande
 * ne fige que le nom et le prix : le rayon d'un produit est une propriété du
 * catalogue d'aujourd'hui, et c'est le catalogue d'aujourd'hui qu'on suit pour
 * s'organiser au fournil. Un SKU absent du catalogue (produit retiré depuis) ne
 * disparaît pas pour autant — il tombe dans un groupe à part, en fin de liste.
 */

/** Un produit à fabriquer, tous bons de commande confondus. */
export interface ProductionRecapLine {
  readonly sku: string;
  /** Le nom **figé à la commande** — le seul dont on soit sûr qu'il a été vendu. */
  readonly productName: string;
  readonly quantity: number;
  /** Sur combien de commandes il se répartit : 240 en 3 fois n'est pas 240 en 40. */
  readonly orderCount: number;
}

/** Un rayon et son contenu. */
export interface ProductionRecapGroup {
  /** `null` = les SKU que le catalogue ne connaît plus. */
  readonly category: CatalogCategory | null;
  readonly label: string;
  readonly quantity: number;
  readonly lines: readonly ProductionRecapLine[];
}

/** Le groupe des produits que le catalogue ne connaît plus — jamais silencieux. */
const OFF_CATALOG_LABEL = 'Hors catalogue';

interface Tally {
  productName: string;
  quantity: number;
  orderCount: number;
}

/**
 * Agrège les lignes d'un lot, groupées par rayon.
 *
 * Les rayons sortent dans l'**ordre de la vitrine** (`CATALOG_CATEGORY_ORDER`) et
 * non par poids : c'est l'ordre que l'équipe connaît déjà du catalogue, et un
 * ordre qui bougerait d'un jour à l'autre obligerait à relire la feuille en
 * entier. À l'intérieur d'un rayon, en revanche, la **quantité décroissante** —
 * c'est par le plus gros que le fournil commence. À quantité égale, par nom,
 * pour que deux tirages rendent exactement la même feuille.
 */
export function productionRecap(
  sheets: readonly ProductionSheet[],
  catalogue: readonly CatalogItemView[],
): readonly ProductionRecapGroup[] {
  const categoryOf = new Map(catalogue.map((item) => [item.sku, item.category]));
  const bySku = new Map<string, Tally>();

  for (const sheet of sheets) {
    for (const line of sheet.lines) {
      const tally = bySku.get(line.sku);
      if (tally === undefined) {
        bySku.set(line.sku, {
          productName: line.productName,
          quantity: line.quantity,
          orderCount: 1,
        });
        continue;
      }
      tally.quantity += line.quantity;
      tally.orderCount += 1;
    }
  }

  const buckets = new Map<CatalogCategory | null, ProductionRecapLine[]>();
  for (const [sku, tally] of bySku) {
    const category = categoryOf.get(sku) ?? null;
    const lines = buckets.get(category) ?? [];
    lines.push({ sku, ...tally });
    buckets.set(category, lines);
  }

  const ordered: (CatalogCategory | null)[] = [...CATALOG_CATEGORY_ORDER, null];
  return ordered
    .filter((category) => buckets.has(category))
    .map((category) => {
      const lines = [...(buckets.get(category) ?? [])].sort(
        (a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName, 'fr'),
      );
      return {
        category,
        label: category === null ? OFF_CATALOG_LABEL : CATALOG_CATEGORY_LABELS[category],
        quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
        lines,
      };
    });
}

/** Le total de pièces du lot — le chiffre qu'on annonce au fournil en une phrase. */
export function totalPieces(groups: readonly ProductionRecapGroup[]): number {
  return groups.reduce((sum, group) => sum + group.quantity, 0);
}
