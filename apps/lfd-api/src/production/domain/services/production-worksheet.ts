import type { ProducibleOrder } from "../../channels/commerce/day-orders.reader.js";
import type { ProducedItemSnapshot } from "../entities/production-day.js";

/**
 * **La fiche d'atelier** — le compte à produire d'une journée, rendu cochable,
 * et ce qui est arrivé depuis qu'il est arrêté.
 *
 * Une fonction pure, comme `forecastMatrix` : le handler lit trois sources et
 * les lui passe. C'est ce qui rend l'arbitrage — « le compte arrêté l'emporte,
 * la demande sinon » — éprouvable sans Nest, sans base, et sans doubler quoi
 * que ce soit.
 *
 * ⚠️ **Le même arbitrage que le prévisionnel, et il doit le rester.** Deux
 * écrans du même fournil qui trancheraient différemment afficheraient deux
 * vérités le même matin, et c'est celui qui pétrit qui arbitrerait.
 */

/** Le contenant d'un produit au four, tel que le fournil l'a réglé. */
export interface ContainerRule {
  readonly unitsPerContainer: number;
  readonly singular: string;
  readonly plural: string;
}

/** Un article du commerce, sans coche : une demande n'a personne pour la cocher. */
export interface DemandedItem {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
}

/** Ce que le handler pose sur la table. */
export interface WorksheetSources {
  /** `null` = la journée n'est pas arrêtée. */
  readonly closedAt: Date | null;
  readonly retakenAt: Date | null;
  /** L'instantané. Vide et non pertinent tant que rien n'est arrêté. */
  readonly counts: readonly ProducedItemSnapshot[];
  /** Ce que le commerce annonce pour ce jour — la source des journées ouvertes. */
  readonly demand: readonly DemandedItem[];
  /**
   * Les commandes `placed` du jour que la journée **ne porte pas encore**.
   *
   * Filtrées par `orderId` en amont : sans ce filtre, un événement de clôture
   * perdu (le bus vit en processus, n'est ni persisté ni rejoué) laisserait des
   * commandes `placed` déjà inscrites au plan, et l'écart les compterait une
   * seconde fois.
   */
  readonly arrivals: readonly ProducibleOrder[];
  readonly containers: ReadonlyMap<string, ContainerRule>;
}

export interface WorksheetLine {
  readonly sku: string;
  readonly productName: string;
  readonly quantity: number;
  readonly containerLabel: string | null;
  readonly done: boolean;
  readonly initials: string | null;
  readonly doneAt: Date | null;
}

export interface WorksheetDriftLine {
  readonly sku: string;
  readonly productName: string;
  readonly from: number;
  readonly to: number;
  readonly done: boolean;
}

export interface WorksheetDrift {
  readonly orders: number;
  readonly addedUnits: number;
  readonly lines: readonly WorksheetDriftLine[];
}

export interface Worksheet {
  readonly generatedAt: Date | null;
  readonly retakenAt: Date | null;
  readonly lines: readonly WorksheetLine[];
  readonly drift: WorksheetDrift | null;
}

/**
 * Assemble la fiche.
 *
 * ## L'arbitrage, en une phrase
 *
 * Journée **arrêtée** → l'instantané, son heure de tirage, et l'écart s'il y en
 * a. Journée **ouverte** → la demande du commerce, aucune heure (rien n'a été
 * arrêté, donc il n'y a rien à dater), et aucun écart : ce qui n'est pas figé
 * ne peut pas être périmé.
 *
 * Écrire l'heure de la LECTURE sur une journée ouverte aurait été le piège :
 * une fiche qui porte une heure passe pour un tirage, et deux personnes
 * croiraient lire le même papier en en lisant deux.
 *
 * ## L'ordre des lignes
 *
 * Quantité décroissante, puis nom, puis SKU. C'est par le plus gros que le
 * fournil commence, et les deux départages font que deux lectures rendent la
 * même feuille dans le même ordre — sans quoi on relirait tout à chaque
 * rafraîchissement.
 *
 * ⚠️ Ce n'est pas l'ordre des CUISSONS, qui serait le bon et qu'aucune table ne
 * porte. Le handoff le note comme la seule donnée qui manque aux trois vues.
 */
export function worksheetOf(sources: WorksheetSources): Worksheet {
  const closed = sources.closedAt !== null;
  const lines = closed
    ? sources.counts.map((item) => line(item, sources.containers))
    : sources.demand.map((item) => line({ ...item, done: null }, sources.containers));
  return {
    generatedAt: sources.closedAt,
    retakenAt: sources.retakenAt,
    lines: [...lines].sort(byWeightThenName),
    drift: closed ? driftOf(sources) : null,
  };
}

/** Une ligne, avec son libellé de contenant s'il y en a un de réglé. */
function line(
  item: ProducedItemSnapshot,
  containers: ReadonlyMap<string, ContainerRule>,
): WorksheetLine {
  return {
    sku: item.sku,
    productName: item.productName,
    quantity: item.quantity,
    containerLabel: containerLabelOf(item.quantity, containers.get(item.sku)),
    done: item.done !== null,
    // La chaîne vide n'est pas une signature : une ligne cochée sans initiales
    // rend `null`, comme une ligne pas faite. L'écran n'a alors rien à afficher
    // dans la colonne, plutôt qu'un blanc qui ressemble à une case à remplir.
    initials: item.done === null || item.done.initials === "" ? null : item.done.initials,
    doneAt: item.done?.at ?? null,
  };
}

/**
 * « 4 tourneuses ». `null` quand aucun contenant n'est réglé — la colonne reste
 * vide, parce qu'une fiche qui annoncerait « 1 plaque » ferait sortir la
 * mauvaise quantité.
 *
 * On arrondit **au-dessus** : 41 baguettes pour 10 par tourneuse font 5
 * tourneuses, dont une presque vide. Arrondir en dessous en laisserait une
 * pleine sur le carreau.
 */
function containerLabelOf(quantity: number, rule: ContainerRule | undefined): string | null {
  if (rule === undefined) {
    return null;
  }
  const count = Math.ceil(quantity / rule.unitsPerContainer);
  return `${count} ${count === 1 ? rule.singular : rule.plural}`;
}

/**
 * **Ce que le retirage absorberait**, ligne par ligne.
 *
 * Il nomme les lignes au lieu de rendre un compteur, et dit lesquelles sont
 * **déjà cochées** : c'est le seul cas réellement dangereux du lot — quelqu'un a
 * déclaré avoir sorti 30 pièces d'un article qui en demande 42, et personne ne
 * s'en apercevra avant le colisage.
 *
 * `null` quand rien n'est arrivé : un bandeau qui s'affiche pour dire « rien »
 * apprend à ne plus le lire.
 */
function driftOf(sources: WorksheetSources): WorksheetDrift | null {
  if (sources.arrivals.length === 0) {
    return null;
  }
  const known = new Map(sources.counts.map((item) => [item.sku, item] as const));
  const added = new Map<string, { productName: string; quantity: number }>();
  for (const order of sources.arrivals) {
    for (const item of order.lines) {
      const seen = added.get(item.sku);
      added.set(item.sku, {
        productName: seen?.productName ?? item.productName,
        quantity: (seen?.quantity ?? 0) + item.quantity,
      });
    }
  }
  const lines = [...added.entries()].map(([sku, item]) => {
    const current = known.get(sku);
    return {
      sku,
      // Le nom de la fiche l'emporte sur celui de la commande qui arrive : c'est
      // celui que le fournil lit depuis 4 h. `0` en `from` dit un article
      // entièrement neuf, et c'est une information à part entière.
      productName: current?.productName ?? item.productName,
      from: current?.quantity ?? 0,
      to: (current?.quantity ?? 0) + item.quantity,
      done: current?.done != null,
    };
  });
  return {
    orders: sources.arrivals.length,
    addedUnits: lines.reduce((total, entry) => total + (entry.to - entry.from), 0),
    lines: lines.sort(byWeightThenName),
  };
}

/** Le plus gros d'abord ; à égalité, le nom, puis le SKU — jamais l'ordre d'arrivée. */
function byWeightThenName(
  left: { quantity?: number; to?: number; productName: string; sku: string },
  right: { quantity?: number; to?: number; productName: string; sku: string },
): number {
  const weight = (entry: { quantity?: number; to?: number }): number =>
    entry.quantity ?? entry.to ?? 0;
  return (
    weight(right) - weight(left) ||
    left.productName.localeCompare(right.productName) ||
    left.sku.localeCompare(right.sku)
  );
}
