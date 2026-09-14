import {
  AtelierSheetNotFoundError,
  ContainerCeilingReachedError,
  InvalidContainerCountError,
  LineNotProducedYetError,
  PackedOrderSealedError,
  PackingLineNotFoundError,
  ProductionDayNotClosedError,
} from "../errors/production-errors.js";
import { type ContainerStep, MAX_CONTAINERS_PER_ORDER } from "../value-objects/container-step.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";
import type {
  ProducedItemSnapshot,
  ProductionLineSnapshot,
  ProductionOrderSnapshot,
} from "./production-day.snapshot.js";

/**
 * **Les gardes du colisage** — ce qu'une journée refuse qu'on mette au bac, qu'on
 * en ressorte ou qu'on compte, **sans jamais rien muter**.
 *
 * ## Pourquoi hors de la classe, et pourquoi ce n'est pas deux agrégats
 *
 * Sorties de `production-day.ts` le 2026-09-14, quand le fichier dépassait six
 * cents lignes — dont la moitié pour ces gardes et leurs raisons. Elles ne
 * modifient rien : elles lisent la journée et lèvent le refus.
 *
 * 🔴 **La journée reste le seul point d'entrée.** Chaque garde est exposée par
 * une méthode de `ProductionDay` qui l'appelle, et les mutations (`pack`,
 * `declareContainers`) restent dans la classe. Un appelant n'importe jamais ce
 * fichier : il demande à la journée. C'est ce qui empêche la règle de se
 * dédoubler — un handler qui appellerait une garde ici et une autre là-bas
 * aurait deux sources pour le même refus.
 *
 * Elles reçoivent une vue en lecture (`PackingState`) que la journée remplit
 * d'elle-même, par ses propres accesseurs.
 */

/** Ce qu'une garde lit d'une journée — et rien de ce qui la modifie. */
export interface PackingState {
  readonly day: ServiceDay;
  readonly isClosed: boolean;
  readonly orders: readonly ProductionOrderSnapshot[];
  readonly counts: readonly ProducedItemSnapshot[];
}

/**
 * La fiche qu'on s'apprête à coliser — **sans rien muter**.
 *
 * Elle porte les deux refus STRUCTURELS, ceux qui disent que le geste n'a pas
 * de sens ici : la journée n'est pas arrêtée, ou cette référence n'est pas au
 * plan. Elle ne dit rien du bac lui-même — c'est l'appelant qui lit `packed`,
 * parce que « déjà fait » n'est pas une erreur pour tout le monde : le
 * handler y voit une REANNONCE à faire, `pack` y voit un refus.
 *
 * Les deux refus vivent ici, en un seul endroit, plutôt que recopiés chez
 * l'appelant — c'est la raison d'être de cette méthode.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 * @throws {AtelierSheetNotFoundError} aucune commande sous cette référence.
 */
export function sheetToPack(state: PackingState, reference: string): ProductionOrderSnapshot {
  if (!state.isClosed) {
    throw new ProductionDayNotClosedError(state.day.value);
  }
  const target = state.orders.find((order) => order.reference === reference);
  if (target === undefined) {
    throw new AtelierSheetNotFoundError(reference, state.day.value);
  }
  return target;
}

/**
 * La ligne qu'on s'apprête à mettre au bac — ou à en ressortir. **Sans muter.**
 *
 * ## Ce qu'elle refuse, et pourquoi c'est ici
 *
 * Les trois refus STRUCTURELS d'abord, ceux qui disent que le geste n'a pas de
 * sens : la journée n'est pas arrêtée, cette référence n'est pas au plan, ce
 * SKU n'est pas sur ce bon-là. Même figure que {@link sheetToPack}, et même
 * raison : les recopier chez les deux appelants (cocher, décocher) les rendrait
 * invisibles au troisième.
 *
 * Le **bac fermé** ensuite, et c'est la différence avec {@link sheetToPack}.
 * Là-bas, « déjà colisé » n'est pas un refus pour tout le monde — le handler y
 * voit une réannonce à faire — donc la garde reste chez l'appelant. Ici,
 * fermé est un refus pour TOUS les appelants : le contenu du bac a été annoncé
 * au commerce, qui en a tiré « prête pour le client ». Une garde qui vaut pour
 * tous les appelants appartient à l'agrégat.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 * @throws {AtelierSheetNotFoundError} aucune commande sous cette référence.
 * @throws {PackedOrderSealedError} le bac est fermé, son contenu ne bouge plus.
 * @throws {PackingLineNotFoundError} ce SKU n'est pas sur ce bon.
 */
export function lineToPack(
  state: PackingState,
  reference: string,
  sku: string,
): ProductionLineSnapshot {
  const sheet = sheetToPack(state, reference);
  if (sheet.packed !== null) {
    throw new PackedOrderSealedError(reference);
  }
  const line = sheet.lines.find((candidate) => candidate.sku === sku);
  if (line === undefined) {
    throw new PackingLineNotFoundError(sku, reference);
  }
  return line;
}

/**
 * La ligne qu'on s'apprête à **mettre** au bac — `lineToPack`, plus une règle.
 *
 * ## Pourquoi une méthode de plus, et pas une garde dans `lineToPack`
 *
 * Le refus « pas encore sorti du four » ne vaut que dans UN sens. Cocher une
 * ligne dont l'article n'est pas fabriqué ferait compter comme réparti ce qui
 * n'existe pas, et le reste à répartir deviendrait optimiste — le seul sens
 * où se tromper coûte. Mais **ressortir** du bac une ligne devenue « en
 * attente », parce qu'un fournil a repris sa coche sur la fiche d'atelier,
 * doit rester possible : refuser les deux sens enfermerait l'exploitant avec
 * un bac qu'il ne peut ni compléter ni corriger.
 *
 * Deux appelants, deux jeux de refus : la garde asymétrique vit donc dans une
 * méthode à elle, et `lineToPack` garde ce qui vaut pour les deux.
 *
 * ## Ce que « pas encore sorti du four » veut dire, exactement
 *
 * La ligne du compte à produire n'est pas cochée (`done === null`), **ou** le
 * SKU n'est pas au compte du tout. Le second cas est celui d'un article arrivé
 * après le tirage : personne ne l'a fabriqué, et personne ne peut même le
 * cocher sur la fiche tant que le plan n'a pas été repris.
 *
 * 🔴 La règle est ici et pas seulement à l'écran. Un bouton grisé n'est pas
 * une règle : la route reste ouverte, et un second poste — ou un rejeu de la
 * file hors ligne du fournil — passerait à travers.
 *
 * @throws {LineNotProducedYetError} l'article n'est pas sorti du four.
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 * @throws {AtelierSheetNotFoundError} aucune commande sous cette référence.
 * @throws {PackedOrderSealedError} le bac est fermé, son contenu ne bouge plus.
 * @throws {PackingLineNotFoundError} ce SKU n'est pas sur ce bon.
 */
export function lineToFill(
  state: PackingState,
  reference: string,
  sku: string,
): ProductionLineSnapshot {
  const line = lineToPack(state, reference, sku);
  if (isAwaitingProduction(state, sku)) {
    throw new LineNotProducedYetError(line.productName);
  }
  return line;
}

/**
 * L'article attend-il encore le four ?
 *
 * Les deux cas mènent au même refus : pas coché sur la fiche, ou pas au compte
 * du tout. Un SKU absent du compte n'est pas une donnée manquante — c'est un
 * article arrivé après le tirage, que personne n'a fabriqué **ni même pu
 * cocher**. Le traiter comme disponible serait exactement l'erreur qu'on
 * cherche à empêcher.
 */
export function isAwaitingProduction(state: PackingState, sku: string): boolean {
  return state.counts.find((item) => item.sku === sku)?.done == null;
}

/**
 * La commande dont on s'apprête à compter les containers — **sans muter**.
 *
 * Les refus que les deux gestes du compte partagent, en un seul endroit : la
 * journée n'est pas arrêtée et la référence hors du plan (par
 * {@link sheetToPack}), puis le **bac fermé**. Le nombre de bacs a été annoncé
 * avec le reste ; le corriger après coup ferait mentir ce que le commerce a
 * déjà dit au client, et le chargeur du véhicule compte sur un papier qui ne
 * bouge pas.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 * @throws {AtelierSheetNotFoundError} aucune commande sous cette référence.
 * @throws {PackedOrderSealedError} le bac est fermé, son annonce ne bouge plus.
 */
export function sheetToCount(state: PackingState, reference: string): ProductionOrderSnapshot {
  const sheet = sheetToPack(state, reference);
  if (sheet.packed !== null) {
    throw new PackedOrderSealedError(reference);
  }
  return sheet;
}

/**
 * **Un container de plus, ou de moins** — la garde du geste, sans muter.
 *
 * Elle ne calcule PAS le nouveau compte, et c'est délibéré : c'est la base qui
 * l'écrit, en une opération atomique (`container_count ± 1`). Un calcul ici
 * suivi d'une écriture rouvrirait exactement la course qu'on ferme — deux
 * postes liraient 3, écriraient 4, et un container disparaîtrait.
 *
 * Ce qu'elle refuse, sur l'état lu :
 *
 * - tout ce que {@link sheetToCount} refuse ;
 * - un **ajout au plafond**.
 *
 * Un **retrait à zéro** n'est pas refusé : il est sans effet. L'écran n'a pas à
 * comparer le compte à zéro pour savoir s'il peut appuyer — c'est un calcul,
 * et le poste n'en fait plus.
 *
 * @throws {ContainerCeilingReachedError} la commande est déjà au plafond.
 */
export function containerStepOn(
  state: PackingState,
  reference: string,
  step: ContainerStep,
): ProductionOrderSnapshot {
  const sheet = sheetToCount(state, reference);
  if (step === "add" && sheet.containers >= MAX_CONTAINERS_PER_ORDER) {
    throw new ContainerCeilingReachedError(reference, MAX_CONTAINERS_PER_ORDER);
  }
  return sheet;
}

/**
 * Un **total** de containers est-il un nombre de bacs ?
 *
 * Négatif, fractionnaire ou au-delà du plafond ne l'est pas. Le plafond est une
 * règle du domaine (`MAX_CONTAINERS_PER_ORDER`) : le laisser au seul schéma de la
 * route aurait fait deux plafonds pour un même compte.
 *
 * @throws {InvalidContainerCountError} ce n'est pas un nombre de bacs.
 */
export function assertContainerCount(containers: number): void {
  if (!Number.isInteger(containers) || containers < 0 || containers > MAX_CONTAINERS_PER_ORDER) {
    throw new InvalidContainerCountError(containers);
  }
}
