import {
  SHELF_LABEL_OFF_CATALOG,
  SHELF_LABEL_UNKNOWN,
  type CatalogFamilyView,
  type CatalogItemView,
  type AtelierSheet,
} from '@lfd/contracts';
import { catalogShelves } from '@lfd/b2b-ui/catalog';

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
  /** `null` = les SKU dont la famille n'est pas connue (retirés, ou catalogue illisible). */
  readonly family: CatalogFamilyView | null;
  readonly label: string;
  readonly quantity: number;
  readonly lines: readonly ProductionRecapLine[];
}

/**
 * Le groupe des produits que le catalogue ne connaît plus — jamais silencieux.
 *
 * ⚠️ En exploitation normale, **il n'apparaît pas** : le catalogue du
 * back-office rend les articles vendables sous le SKU du PRODUIT, celui que
 * portent les lignes de commande, et un groupe vide n'est jamais rendu. Il ne
 * se remplit qu'avec un article **retiré** depuis la commande.
 */
const OFF_CATALOG_LABEL = SHELF_LABEL_OFF_CATALOG;

/**
 * Le même groupe quand le catalogue n'a **pas pu être lu**.
 *
 * 🔴 Sans cette distinction, une lecture en échec range TOUT sous « Hors
 * catalogue » — et la feuille affirme que le fournil fabrique des produits
 * retirés de la vente. Un mensonge plausible est le pire des deux : rien à
 * l'écran ne dit que la phrase vient d'une panne. Corrigé le 2026-09-11, en
 * même temps que le prévisionnel, qui portait le défaut recopié d'ici.
 */
const UNKNOWN_SHELF_LABEL = SHELF_LABEL_UNKNOWN;

interface Tally {
  productName: string;
  quantity: number;
  orderCount: number;
}

/**
 * Agrège les lignes d'un lot, groupées par rayon.
 *
 * Les rayons sortent dans l'**ordre du référentiel** (la `position` de la
 * famille, via `catalogShelves`) et non par poids : c'est l'ordre que l'équipe connaît déjà du catalogue, et un
 * ordre qui bougerait d'un jour à l'autre obligerait à relire la feuille en
 * entier. À l'intérieur d'un rayon, en revanche, la **quantité décroissante** —
 * c'est par le plus gros que le fournil commence. À quantité égale, par nom,
 * pour que deux tirages rendent exactement la même feuille.
 */
export function productionRecap(
  sheets: readonly AtelierSheet[],
  catalogue: readonly CatalogItemView[],
  /**
   * Le catalogue a-t-il été LU ? `false` = la lecture a échoué, et l'absence
   * d'un SKU ne prouve alors rien sur lui. Un défaut à `true` : l'appelant
   * normal a son catalogue, et c'est la panne qui doit se déclarer.
   */
  shelvesKnown = true,
): readonly ProductionRecapGroup[] {
  const familyOf = new Map(catalogue.map((item) => [item.sku, item.family]));
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

  const tallied: ProductionRecapLine[] = [...bySku].map(([sku, tally]) => ({ sku, ...tally }));
  return catalogShelves(tallied, (line) => familyOf.get(line.sku) ?? null).map((shelf) => {
    const lines = [...shelf.items].sort(
      (a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName, 'fr'),
    );
    return {
      family: shelf.family,
      label: shelfLabel(shelf.family, shelvesKnown),
      quantity: lines.reduce((sum, line) => sum + line.quantity, 0),
      lines,
    };
  });
}

/**
 * Le nom d'un rayon — et ce qu'on dit quand on ne le connaît pas.
 *
 * Exporté parce que la **fiche d'atelier** groupe les mêmes SKU par les mêmes
 * rayons, et doit dire la panne avec les mêmes mots. Deux écrans du même fournil
 * qui nommeraient différemment une lecture ratée du catalogue en feraient deux
 * incidents distincts (ouvert le 2026-09-13).
 */
export function shelfLabel(family: CatalogFamilyView | null, shelvesKnown: boolean): string {
  if (family !== null) {
    return family.name;
  }
  return shelvesKnown ? OFF_CATALOG_LABEL : UNKNOWN_SHELF_LABEL;
}

/** Le total de pièces du lot — le chiffre qu'on annonce au fournil en une phrase. */
export function totalPieces(groups: readonly ProductionRecapGroup[]): number {
  return groups.reduce((sum, group) => sum + group.quantity, 0);
}
