import type { SaleUnit } from "@lfd/money";

import type { ProducibleOrder } from "../../channels/commerce/day-orders.reader.js";
import type { ProducedItemSnapshot, ProductionBatchSnapshot } from "../entities/production-day.js";
import { activeBatchesOf, countedBatch, implicitBatchesOf, outputOf } from "./production-output.js";
import { driftOf } from "./production-worksheet-drift.js";
import { byWeightThenName } from "./worksheet-order.js";

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
  /** Des pièces, ou des grammes si `saleUnit = "weight"` (P6). */
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
}

/** Ce que le handler pose sur la table. */
export interface WorksheetSources {
  /** `AAAA-MM-JJ` — l'`id` des fournées implicites en dépend (§5.2 des fournées). */
  readonly serviceDay: string;
  /** `null` = la journée n'est pas arrêtée. */
  readonly closedAt: Date | null;
  readonly retakenAt: Date | null;
  /** L'instantané. Vide et non pertinent tant que rien n'est arrêté. */
  readonly counts: readonly ProducedItemSnapshot[];
  /** Les fournées réelles du jour, annulées comprises — les implicites se déduisent ici. */
  readonly batches: readonly ProductionBatchSnapshot[];
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
  /**
   * Des pièces, ou des grammes si `saleUnit = "weight"` (P6) — et alors
   * `produced`, `remaining`, `surplus` et les fournées sont des grammes aussi :
   * un article n'a qu'une unité.
   */
  readonly quantity: number;
  readonly saleUnit: SaleUnit;
  readonly containerLabel: string | null;
  /** Complète (D2 des fournées) — le nom de l'ancienne case, gardé au contrat. */
  readonly done: boolean;
  /** Celles de la fournée qui a complété la ligne. */
  readonly initials: string | null;
  /** L'heure de la fournée qui a complété la ligne. */
  readonly doneAt: Date | null;
  readonly produced: number;
  readonly remaining: number;
  readonly surplus: number;
  /** Les fournées qui comptent, dans l'ordre de sortie. */
  readonly batches: readonly ProductionBatchSnapshot[];
  readonly container: ContainerRule | null;
  /**
   * Les pièces demandées en retour au colisage, sans réponse (K2, §13 B2) —
   * encore comptées dans `produced` : « sorti » ne baisse qu'à la réponse.
   */
  readonly pendingReturn: number;
}

export interface WorksheetDriftLine {
  readonly sku: string;
  readonly productName: string;
  /** `from` et `to` sont des grammes si `weight` (P6). */
  readonly saleUnit: SaleUnit;
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
  const batches = closed ? effectiveBatches(sources) : [];
  const lines = closed
    ? [
        ...sources.counts.map((item) => line(item, sources.containers, batches)),
        ...outOfCount(sources.counts, batches, sources.containers),
      ]
    : sources.demand.map((item) => line(item, sources.containers, []));
  return {
    generatedAt: sources.closedAt,
    retakenAt: sources.retakenAt,
    lines: [...lines].sort(byWeightThenName),
    drift: closed ? driftOf(sources, batches) : null,
  };
}

/**
 * Les fournées réelles — pour ce qu'elles comptent, rendus du colisage déduits
 * (K2) —, et les implicites des coches héritées (§5.2).
 */
function effectiveBatches(sources: WorksheetSources): readonly ProductionBatchSnapshot[] {
  return [
    ...sources.batches.map(countedBatch),
    ...implicitBatchesOf(sources.serviceDay, sources.counts, sources.batches),
  ];
}

/**
 * Une ligne : sa quantité, ses fournées et leurs dérivés (D2), son contenant.
 *
 * `done`, `doneAt` et `initials` gardent leurs noms d'avant les fournées : ils
 * disent désormais « complète », et l'heure et la signature de la fournée qui
 * l'a complétée (§4).
 */
function line(
  item: DemandedItem,
  containers: ReadonlyMap<string, ContainerRule>,
  batches: readonly ProductionBatchSnapshot[],
): WorksheetLine {
  const active = activeBatchesOf(batches, item.sku);
  const output = outputOf(item.quantity, active);
  const rule = containers.get(item.sku);
  const completing = output.complete ? output.completedBy : null;
  return {
    sku: item.sku,
    productName: item.productName,
    quantity: item.quantity,
    saleUnit: item.saleUnit,
    containerLabel: containerLabelOf(item.quantity, rule),
    done: output.complete,
    // La chaîne vide n'est pas une signature : une ligne complétée sans
    // initiales rend `null`, comme une ligne pas faite.
    initials:
      completing === null || completing.recorded.initials === ""
        ? null
        : completing.recorded.initials,
    doneAt: completing?.recorded.at ?? null,
    produced: output.produced,
    remaining: output.remaining,
    surplus: output.surplus,
    batches: active,
    container: rule ?? null,
    pendingReturn: active.reduce((total, batch) => total + batch.pendingReturn, 0),
  };
}

/**
 * **Le surplus hors compte** (§5 bis des fournées) : un SKU qui a des fournées
 * mais n'est plus au compte garde ses fournées, et la fiche les montre en ligne
 * de quantité 0. Le nom est le SKU : une fournée ne porte pas de libellé, et en
 * inventer un serait pire que de montrer la clé.
 *
 * ⚠️ Aucun geste ne retire un SKU du compte à ce jour (le retirage n'ajoute que
 * des commandes, vérifié le 2026-09-28) : la branche est une garde, pas un cas
 * courant.
 */
function outOfCount(
  counts: readonly ProducedItemSnapshot[],
  batches: readonly ProductionBatchSnapshot[],
  containers: ReadonlyMap<string, ContainerRule>,
): readonly WorksheetLine[] {
  const counted = new Set(counts.map((item) => item.sku));
  const orphans = new Set(
    batches
      .filter((batch) => batch.cancelled === null && !counted.has(batch.sku))
      .map((batch) => batch.sku),
  );
  return [...orphans].map((sku) =>
    // Une fournée hors compte ne dit pas son unité : sans ligne de commande,
    // on ne sait que des pièces (P6) — le cas ne naît que d'un article retiré
    // du compte après une fournée.
    line({ sku, productName: sku, quantity: 0, saleUnit: "piece" }, containers, batches),
  );
}

/**
 * « 4 tourneuses ». `null` quand aucun contenant n'est réglé — la colonne reste
 * vide, parce qu'une fiche qui annoncerait « 1 plaque » ferait sortir la
 * mauvaise quantité.
 *
 * On arrondit **au-dessus** : 41 baguettes pour 10 par tourneuse font 5
 * tourneuses, dont une presque vide. Arrondir en dessous en laisserait une
 * pleine sur le carreau.
 *
 * Un article au poids règle son contenant en GRAMMES, l'unité de sa ligne
 * (P6 de `pricing/plan-vente-au-poids.md`) : 3 250 g pour une plaque de
 * 1 500 g font 3 plaques — le même calcul, dans une seule unité.
 */
function containerLabelOf(quantity: number, rule: ContainerRule | undefined): string | null {
  if (rule === undefined) {
    return null;
  }
  const count = Math.ceil(quantity / rule.unitsPerContainer);
  return `${count} ${count === 1 ? rule.singular : rule.plural}`;
}
