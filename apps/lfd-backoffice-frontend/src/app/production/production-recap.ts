import {
  type AtelierSheet,
  type OrderSaleUnit,
  type ProductionDayResupply,
  type ProductionGroupingView,
  type WorkshopLineRole,
} from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

import { distinctBySku, servedGroups } from './served-groups';

/**
 * La **récapitulation de production** : ce que le lot représente, rayon par
 * rayon puis produit par produit, toutes commandes confondues.
 *
 * C'est l'autre façon de lire la même pile, et c'est celle par laquelle on
 * commence. Une boulangerie ne fabrique pas commande par commande — elle pétrit
 * 240 croissants, puis répartit. Les bons de commande disent la répartition ;
 * ce récapitulatif dit la fabrication. Aucun ne remplace l'autre.
 *
 * **Le rangement vient du serveur, pas de la commande** (`POST
 * …/workstations/grouping`, plan des postes § 3.7) : par rayon en mode
 * boutique, par poste en mode prod. Un SKU que le rangement ne nomme pas ne
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
  /** Dont réassort — un détail du total, jamais à part de lui. Des grammes au poids. */
  readonly resupplyQuantity: number;
  /** Combien de réassorts portent ce produit — au poids, chacun compte pour une pièce. */
  readonly resupplyCount: number;
  /** « 24 », ou « 1,25 kg » au poids — le « dont … réassort » de la ligne. */
  readonly resupplyLabel: string;
}

/** Un rayon et son contenu. */
export interface ProductionRecapGroup {
  /** La clé du groupe servi : l'id du rayon racine, `ws:<id du poste>`, `?`. */
  readonly key: string;
  readonly label: string;
  /** Les pièces du rayon : un article au poids y compte une par commande (P6). */
  readonly quantity: number;
  /** Les pièces de réassort du rayon : jamais une somme de pièces et de grammes. */
  readonly resupplyQuantity: number;
  readonly lines: readonly ProductionRecapLine[];
  /** Les intertitres de sous-catégorie (SKU de la première ligne → nom) ; vide, réglage éteint. */
  readonly intertitles: ReadonlyMap<string, string>;
  /** SKU → « étape » ou « finit », pour les seuls produits à plusieurs postes. */
  readonly roles: ReadonlyMap<string, WorkshopLineRole>;
}

interface Tally {
  productName: string;
  saleUnit: OrderSaleUnit;
  quantity: number;
  orderCount: number;
  resupplyQuantity: number;
  resupplyCount: number;
}

/**
 * Agrège les lignes d'un lot, groupées par le rangement servi.
 *
 * Les groupes sortent dans l'ordre du serveur. À l'intérieur d'un groupe, la
 * **quantité décroissante** — c'est par le plus gros que le fournil commence.
 * À quantité égale, par nom, pour que deux tirages rendent la même feuille.
 */
export function productionRecap(
  sheets: readonly AtelierSheet[],
  /** Le rangement servi ; `null` : pas lu, tout tombe en « Rayon inconnu ». */
  grouping: ProductionGroupingView | null,
  /**
   * Les réassorts de la journée (R3d-bis, Hugo 2026-10-21) : ils vont sur les
   * mêmes fiches de poste, dans le total — c'est ce que le poste enfourne.
   */
  resupplies: readonly ProductionDayResupply[] = [],
): readonly ProductionRecapGroup[] {
  const tallied = talliesOf(sheets, resupplies);
  const biggestFirst = (a: ProductionRecapLine, b: ProductionRecapLine): number =>
    recapPieces(b) - recapPieces(a) || a.productName.localeCompare(b.productName, 'fr');
  return servedGroups(tallied, grouping, biggestFirst).map((group) => ({
    key: group.key,
    label: group.title,
    quantity: group.lines.reduce((sum, line) => sum + recapPieces(line), 0),
    resupplyQuantity: group.lines.reduce((sum, line) => sum + recapResupplyPieces(line), 0),
    lines: group.lines,
    intertitles: group.intertitles,
    roles: group.roles,
  }));
}

/** Les SKU qu'un lot et ses réassorts font afficher — ceux qu'on fait ranger. */
export function recapSkus(
  sheets: readonly AtelierSheet[],
  resupplies: readonly ProductionDayResupply[],
): readonly string[] {
  return talliesOf(sheets, resupplies).map((line) => line.sku);
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
      resupplyCount: 0,
    };
    bySku.set(sku, tally);
    tally.quantity += quantity;
    if (fromOrder) {
      tally.orderCount += 1;
    } else {
      tally.resupplyQuantity += quantity;
      tally.resupplyCount += 1;
    }
  };
  for (const sheet of sheets) {
    for (const line of sheet.lines) {
      add({ ...line, saleUnit: line.saleUnit ?? 'piece' }, true);
    }
  }
  for (const resupply of resupplies) {
    for (const line of resupply.lines) {
      // Un réassort porte son unité depuis le lot L2b-4 : au poids, des grammes,
      // comme le dossier du jour du serveur (`day-dossier.ts`, `talliesOf`).
      add(line, false);
    }
  }
  return [...bySku].map(([sku, tally]) => ({
    sku,
    ...tally,
    label: saleQuantityLabel(tally.quantity, tally.saleUnit),
    resupplyLabel: saleQuantityLabel(tally.resupplyQuantity, tally.saleUnit),
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
 * commande et une par réassort qui le portent (P6). La même règle que le
 * dossier du jour serveur (`recapPieces`, `day-dossier.ts`) : l'écran et le
 * PDF disent le même total.
 */
export function recapPieces(line: ProductionRecapLine): number {
  return line.saleUnit === 'weight' ? line.orderCount + line.resupplyCount : line.quantity;
}

/**
 * La part réassort d'un produit, en pièces : au poids, un réassort compte pour
 * une, jamais ses grammes (`recapResupplyPieces`, `day-dossier.ts`).
 */
export function recapResupplyPieces(line: ProductionRecapLine): number {
  return line.saleUnit === 'weight' ? line.resupplyCount : line.resupplyQuantity;
}

/**
 * Le total de pièces du lot, réassorts compris — le chiffre qu'on annonce au
 * fournil. Un total GÉNÉRAL : un produit répété sous plusieurs postes n'y
 * compte qu'une fois (`un-produit-sur-plusieurs-postes.md`, § 2.2).
 */
export function totalPieces(groups: readonly ProductionRecapGroup[]): number {
  return distinctBySku(groups).reduce((sum, line) => sum + recapPieces(line), 0);
}

/** Les pièces de réassort du lot — le détail du total, dédoublonné comme lui. */
export function resupplyPieces(groups: readonly ProductionRecapGroup[]): number {
  return distinctBySku(groups).reduce((sum, line) => sum + recapResupplyPieces(line), 0);
}
