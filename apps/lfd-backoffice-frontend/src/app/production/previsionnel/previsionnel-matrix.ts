import {
  type OrderSaleUnit,
  type ProductionGroupingView,
  type ProductionForecastLine,
  type ProductionForecastView,
} from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';

import type { SlotState } from '../fiche-atelier/rules/workshop-deadlines';
import { distinctBySku, servedGroups } from '../served-groups';

/**
 * La **matrice du prévisionnel**, telle que l'écran la lit — et rien d'autre.
 *
 * Le serveur rend la grille à plat, une ligne par produit, triée par SKU : un
 * ordre stable, donc deux lectures rendent la même chose. Le RANGEMENT aussi
 * vient du serveur (`POST …/workstations/grouping`, plan des postes § 3.7) :
 * par rayon racine dans l'ordre du référentiel en mode boutique, par poste en
 * mode prod. L'écran ne garde que l'ordre à l'intérieur d'un groupe, la
 * **quantité décroissante** sur toute la plage : c'est par le plus gros que le
 * fournil commence. À égalité, par nom, pour que deux affichages rendent la
 * même grille. C'est la même règle que la récapitulation du jour
 * (`production-recap.ts`).
 */

/**
 * Le facteur au-delà duquel une quantité est **exceptionnelle** : deux fois la
 * moyenne des jours où ce produit sort. C'est la commande qui double une ligne,
 * celle qu'on veut voir sans la chercher.
 */
const EXCEPTIONAL_FACTOR = 2;

/** Une case : sa quantité, et si elle sort de l'ordinaire pour ce produit-là. */
export interface ForecastCell {
  /** Des pièces, ou des grammes si le produit se vend au poids (P6). */
  readonly quantity: number;
  /** « 48 », ou « 1,25 kg » au poids — ce que la case écrit. */
  readonly label: string;
  /** Ce que la case pèse dans un total de rayon : ses pièces, ou 1 au poids. */
  readonly pieces: number;
  /** `true` = plus de deux fois la moyenne du produit sur ses jours actifs. */
  readonly exceptional: boolean;
  /** La part des réassorts dans `quantity` (lot R3d) — jamais en plus. */
  readonly resupply: number;
  /**
   * « sorti / à sortir », et le jour même l'état de la tranche pour ce
   * produit — la journée par tranche. Absent du prévisionnel par jours.
   */
  readonly progress?: ForecastCellProgress;
  /** Des mentions à signaler sous le chiffre (« 120 attendus à 04:30, avant la première tranche »). */
  readonly notes?: readonly string[];
}

/**
 * « 80 / 120 », et — le jour même seulement — l'état de la tranche, en mot
 * (le texte accessible) ET en état (le token). `null` ailleurs : juste le compte.
 */
export interface ForecastCellProgress {
  readonly label: string;
  readonly state: SlotState | null;
  readonly stateLabel: string | null;
}

/** Une ligne de la grille : un produit, et ce qu'il pèse chaque jour. */
export interface ForecastProduct {
  readonly sku: string;
  readonly productName: string;
  /** L'unité du produit (`vente-au-poids.md`, P6) ; `null` = inconnue (hors fiche d'atelier). */
  readonly saleUnit: OrderSaleUnit | null;
  readonly cells: readonly ForecastCell[];
  readonly totalUnits: number;
  /** Une alerte sur la ligne entière (journée par tranche : sources désynchronisées). */
  readonly warning?: string;
}

/** Un rayon : son nom, son poids par jour, et ses produits. */
export interface ForecastRayon {
  /** La clé du groupe servi : l'id du rayon racine, `ws:<id du poste>`, `?`. */
  readonly key: string;
  readonly label: string;
  /** Le total du rayon jour par jour — la ligne de tête du groupe. */
  readonly quantities: readonly number[];
  readonly totalUnits: number;
  readonly lines: readonly ForecastProduct[];
  /**
   * Les intertitres de sous-catégorie : le SKU de la première ligne de chacune
   * → son nom. Vide quand le réglage « Afficher les sous-catégories » est éteint.
   */
  readonly intertitles: ReadonlyMap<string, string>;
}

/**
 * Groupe les lignes du prévisionnel par le rangement servi (§ 3.7 du plan des
 * postes) : un rayon en mode boutique, un poste en mode prod.
 *
 * ⚠️ Le nombre de colonnes vient de `view.days`, **jamais** de la longueur d'une
 * ligne : le contrat promet les deux égales, et s'y fier ici ferait dépendre
 * l'alignement de la grille de la première ligne reçue.
 */
export function forecastRayons(
  view: ProductionForecastView,
  /** `null` : le rangement n'a pas été lu — tout tombe en « Rayon inconnu ». */
  grouping: ProductionGroupingView | null,
): readonly ForecastRayon[] {
  const width = view.days.length;
  const peakColumn = view.days.findIndex((day) => day.date === view.peakDate);
  const products = view.lines.map((line) => productOf(line, width, peakColumn));
  return shelvedRayons(products, width, grouping);
}

/**
 * Range des produits déjà chiffrés par le rangement servi — la règle de la
 * matrice, que la journée par tranche partage : les groupes dans l'ordre du
 * serveur, plus gros d'abord, intertitres si le réglage est allumé, et un
 * total de groupe en PIÈCES (un produit au poids y pèse une pièce par case).
 */
export function shelvedRayons(
  products: readonly ForecastProduct[],
  width: number,
  grouping: ProductionGroupingView | null,
): readonly ForecastRayon[] {
  const byQuantity = (a: ForecastProduct, b: ForecastProduct): number =>
    piecesOf(b) - piecesOf(a) || a.productName.localeCompare(b.productName, 'fr');

  return servedGroups(products, grouping, byQuantity).map((group) => {
    // Un groupe additionne des produits différents : un produit au poids y
    // pèse une pièce par jour où il sort, jamais ses grammes (P6).
    const quantities = Array.from({ length: width }, (_unused, column) =>
      group.lines.reduce((sum, line) => sum + (line.cells[column]?.pieces ?? 0), 0),
    );
    return {
      key: group.key,
      label: group.title,
      quantities,
      totalUnits: quantities.reduce((sum, quantity) => sum + quantity, 0),
      lines: group.lines,
      intertitles: group.intertitles,
    };
  });
}

/**
 * Le total de pièces de la plage — le chiffre qu'on annonce en une phrase. Un
 * total GÉNÉRAL : un produit répété sous plusieurs postes n'y compte qu'une
 * fois (`un-produit-sur-plusieurs-postes.md`, § 2.2).
 */
export function totalOfRayons(rayons: readonly ForecastRayon[]): number {
  return distinctBySku(rayons).reduce((sum, product) => sum + piecesOf(product), 0);
}

/**
 * Une ligne du contrat, augmentée de ce que l'écran marque.
 *
 * La moyenne se prend sur les jours **actifs** — ceux où le produit sort — et
 * non sur toute la plage : un produit livré le seul samedi aurait sinon une
 * moyenne sept fois trop basse, et ses 400 pièces habituelles passeraient pour
 * une commande exceptionnelle chaque semaine.
 */
function productOf(
  line: ProductionForecastLine,
  width: number,
  peakColumn: number,
): ForecastProduct {
  const active = line.quantities.filter((quantity) => quantity > 0);
  const average =
    active.length === 0 ? 0 : active.reduce((sum, quantity) => sum + quantity, 0) / active.length;
  return {
    sku: line.sku,
    productName: line.productName,
    saleUnit: line.saleUnit,
    cells: Array.from({ length: width }, (_unused, column) => {
      const quantity = line.quantities[column] ?? 0;
      return {
        quantity,
        label: saleQuantityLabel(quantity, line.saleUnit),
        pieces: line.saleUnit === 'weight' ? (quantity > 0 ? 1 : 0) : quantity,
        resupply: line.resupplyQuantities[column] ?? 0,
        // Deux silences, et le second a été trouvé en REGARDANT la grille :
        //
        // - un produit qui ne sort qu'un jour n'a rien d'exceptionnel : sa
        //   moyenne EST sa seule valeur, et tout l'écran se pastillerait ;
        // - la colonne du PIC est déjà annoncée, en tête, en couleur et en
        //   toutes lettres. Presque chaque produit y dépasse deux fois sa
        //   moyenne — c'est la définition d'un pic —, donc la mention s'y
        //   répétait ligne après ligne et cessait d'être un signal. Ce qu'on
        //   veut voir, c'est la commande qui double une ligne un jour où
        //   PERSONNE ne s'y attend.
        exceptional:
          active.length > 1 && column !== peakColumn && quantity > average * EXCEPTIONAL_FACTOR,
      };
    }),
    totalUnits: line.totalUnits,
  };
}

/** Ce qu'un produit pèse en pièces sur la plage : ses pièces, ou ses jours au poids. */
function piecesOf(product: ForecastProduct): number {
  return product.cells.reduce((sum, cell) => sum + cell.pieces, 0);
}
