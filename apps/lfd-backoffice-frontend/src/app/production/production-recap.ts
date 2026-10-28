import {
  SHELF_LABEL_OFF_CATALOG,
  SHELF_LABEL_UNKNOWN,
  type CatalogFamilyView,
  type CatalogItemView,
  type AtelierSheet,
  type OrderSaleUnit,
  type ProductionDayResupply,
} from '@lfd/contracts';
import { catalogShelves, saleQuantityLabel } from '@lfd/b2b-ui/catalog';

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

/** Un produit à fabriquer, commandes et réassorts confondus. */
export interface ProductionRecapLine {
  readonly sku: string;
  /** Le nom **figé à la commande** — le seul dont on soit sûr qu'il a été vendu. */
  readonly productName: string;
  /**
   * Le TOTAL que le poste enfourne : commandes + réassorts (R3d-bis). Des
   * grammes si `saleUnit = 'weight'` (P6) — un article, une unité.
   */
  readonly quantity: number;
  readonly saleUnit: OrderSaleUnit;
  /** « 48 », ou « 1,25 kg » au poids — ce que la fiche de poste écrit. */
  readonly label: string;
  /** Sur combien de commandes il se répartit : 240 en 3 fois n'est pas 240 en 40. */
  readonly orderCount: number;
  /** Dont réassort — un détail du total, jamais à part de lui. */
  readonly resupplyQuantity: number;
}

/** Un rayon et son contenu. */
export interface ProductionRecapGroup {
  /** `null` = les SKU dont la famille n'est pas connue (retirés, ou catalogue illisible). */
  readonly family: CatalogFamilyView | null;
  readonly label: string;
  /** Les pièces du rayon : un article au poids y compte une par commande (P6). */
  readonly quantity: number;
  readonly resupplyQuantity: number;
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
  saleUnit: OrderSaleUnit;
  quantity: number;
  orderCount: number;
  resupplyQuantity: number;
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
  /**
   * Les réassorts de la journée (R3d-bis, Hugo 2026-10-21) : ils vont sur les
   * mêmes fiches de poste, dans le total — c'est ce que le poste enfourne.
   */
  resupplies: readonly ProductionDayResupply[] = [],
): readonly ProductionRecapGroup[] {
  const familyOf = new Map(catalogue.map((item) => [item.sku, item.family]));
  const tallied = talliesOf(sheets, resupplies);
  return catalogShelves(tallied, (line) => familyOf.get(line.sku) ?? null).map((shelf) => {
    const lines = [...shelf.items].sort(
      (a, b) => recapPieces(b) - recapPieces(a) || a.productName.localeCompare(b.productName, 'fr'),
    );
    return {
      family: shelf.family,
      label: shelfLabel(shelf.family, shelvesKnown),
      quantity: lines.reduce((sum, line) => sum + recapPieces(line), 0),
      resupplyQuantity: lines.reduce((sum, line) => sum + line.resupplyQuantity, 0),
      lines,
    };
  });
}

/** Additionne par SKU les lignes des bons et celles des réassorts. */
function talliesOf(
  sheets: readonly AtelierSheet[],
  resupplies: readonly ProductionDayResupply[],
): ProductionRecapLine[] {
  const bySku = new Map<string, Tally>();
  const add = (
    { sku, productName, quantity, saleUnit }: TalliedInput,
    fromOrder: boolean,
  ): void => {
    const tally = bySku.get(sku) ?? {
      productName,
      saleUnit,
      quantity: 0,
      orderCount: 0,
      resupplyQuantity: 0,
    };
    bySku.set(sku, tally);
    tally.quantity += quantity;
    if (fromOrder) {
      tally.orderCount += 1;
    } else {
      tally.resupplyQuantity += quantity;
    }
  };
  for (const sheet of sheets) {
    for (const line of sheet.lines) {
      add({ ...line, saleUnit: line.saleUnit ?? 'piece' }, true);
    }
  }
  for (const resupply of resupplies) {
    for (const line of resupply.lines) {
      // Un réassort est toujours à la pièce (`vente-au-poids.md`, § 2).
      add({ ...line, saleUnit: 'piece' }, false);
    }
  }
  return [...bySku].map(([sku, tally]) => ({
    sku,
    ...tally,
    label: saleQuantityLabel(tally.quantity, tally.saleUnit),
  }));
}

/** Une ligne à additionner, réduite à ce que le récapitulatif lit. */
interface TalliedInput {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly saleUnit: OrderSaleUnit;
}

/**
 * Ce qu'un produit pèse en pièces : ses pièces, ou — au poids — une par
 * commande qui le porte (P6). La même règle que le dossier du jour serveur
 * (`recapPieces`, `day-dossier.ts`) : l'écran et le PDF disent le même total.
 */
export function recapPieces(line: ProductionRecapLine): number {
  return line.saleUnit === 'weight' ? line.orderCount : line.quantity;
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

/** Le total de pièces du lot, réassorts compris — le chiffre qu'on annonce au fournil. */
export function totalPieces(groups: readonly ProductionRecapGroup[]): number {
  return groups.reduce((sum, group) => sum + group.quantity, 0);
}

/** Les pièces de réassort du lot — le détail du total. */
export function resupplyPieces(groups: readonly ProductionRecapGroup[]): number {
  return groups.reduce((sum, group) => sum + group.resupplyQuantity, 0);
}
