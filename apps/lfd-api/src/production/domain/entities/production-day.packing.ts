import {
  AtelierSheetNotFoundError,
  ContainerCeilingReachedError,
  OrderAlreadyPackedError,
  InvalidContainerCountError,
  LineNotProducedYetError,
  PackedOrderSealedError,
  PackingLineNotFoundError,
  ProductionDayNotClosedError,
} from "../errors/production-errors.js";
import { type ContainerStep, MAX_CONTAINERS_PER_ORDER } from "../value-objects/container-step.js";
import { availableOf, type BatchState } from "./production-day.batches.js";
import type { ProductionLineSnapshot, ProductionOrderSnapshot } from "./production-day.snapshot.js";

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

/**
 * Ce qu'une garde lit d'une journée — et rien de ce qui la modifie. Les
 * fournées en font partie depuis que « sorti » se compte (D4).
 */
export type PackingState = BatchState;

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
 * **Le bac à fermer** — la garde de `ProductionDay.pack`, sans muter.
 *
 * ## Pourquoi c'est un fait de la PRODUCTION
 *
 * C'est le fournil qui ferme le bac : personne d'autre ne peut le constater.
 * Le commerce en tire le sien — `ready`, « prête pour le client » — par un
 * événement. Deux faits distincts, chacun chez celui qui l'observe ; les
 * confondre reviendrait à faire écrire au fournil dans les tables du commerce.
 *
 * ## Les trois refus, et ce que chacun évite
 *
 * - **journée non arrêtée** : une commande qu'aucune clôture n'a inscrite
 *   n'est pas à fabriquer aujourd'hui ;
 * - **référence inconnue** : elle n'est pas dans cette journée-là ;
 * - **déjà colisée** : deux mains sur la même feuille est le cas NORMAL au
 *   fournil, et le premier scan est le seul vrai. Le second ne doit pas
 *   réécrire l'heure ni changer l'identité qui l'a déclaré.
 *
 * ⚠️ Aucun refus sur une commande ANNULÉE, et c'est un fait, pas un oubli.
 * `cancelled` s'écrit depuis le 2026-09-26 (plan
 * `documentation/order/plan-abandon-du-reglement.md`), mais par deux gestes
 * seulement, et aucun n'atteint une commande inscrite ici (vérifié le
 * 2026-09-26) : l'abandon du client et le balayage de la clôture ne touchent
 * qu'un règlement NON encaissé, que la règle de production n'inscrit jamais,
 * et le balayage passe AVANT le compte. Le jour où une commande PAYÉE
 * s'annulera (chantier d'annulation général), l'annulation devra se propager
 * jusqu'ici, sinon le fournil colisera pour rien.
 *
 * @throws {ProductionDayNotClosedError} la journée n'est pas arrêtée.
 * @throws {AtelierSheetNotFoundError} aucune commande sous cette référence.
 * @throws {OrderAlreadyPackedError} le bac est déjà fait.
 */
export function sheetToSeal(state: PackingState, reference: string): ProductionOrderSnapshot {
  const target = sheetToPack(state, reference);
  if (target.packed !== null) {
    throw new OrderAlreadyPackedError(reference);
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
 * Depuis les fournées (plan `plan-fournees-progressives.md`, D4) : le
 * **disponible** de l'article — sorti moins ce que TOUS les bacs ont déjà pris,
 * fermés compris — ne couvre pas la quantité de cette ligne. Le premier sac de
 * 12 se remplit dès que 12 sont sortis ; le refus dit combien il en manque.
 *
 * Un SKU absent du compte n'a aucune fournée, donc aucun disponible : c'est un
 * article arrivé après le tirage, que personne n'a fabriqué.
 *
 * Une ligne **déjà** au bac passe : ses pièces sont déjà comptées au bac, la
 * recocher n'en prend pas une de plus (le dernier geste réécrit la signature).
 *
 * 🔴 **Évaluée sous le verrou de la journée** (D4) : deux postes qui mettent au
 * bac en même temps sur 12 disponibles liraient chacun 12 sans lui.
 *
 * 🔴 La règle est ici et pas seulement à l'écran. Un bouton grisé n'est pas
 * une règle : la route reste ouverte, et un second poste passerait à travers.
 * Il n'existe PAS de file hors ligne au fournil (cherché le 2026-09-28 dans
 * `lfd-backoffice-frontend/src/app/production` : aucune).
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
  if (line.packed !== null) {
    return line;
  }
  const missing = line.quantity - availableOf(state, sku);
  if (missing > 0) {
    throw new LineNotProducedYetError(line.productName, missing);
  }
  return line;
}

/**
 * L'article attend-il encore le four ? **Rien de disponible** : ce qui est
 * sorti est déjà entièrement dans des bacs, ou rien n'est sorti.
 *
 * Un SKU absent du compte à produire l'est toujours — il est arrivé après le
 * tirage, et personne ne l'a fabriqué. Traiter l'absence d'information comme
 * un disponible serait exactement l'erreur qu'on cherche à empêcher.
 */
export function isAwaitingProduction(state: PackingState, sku: string): boolean {
  return availableOf(state, sku) <= 0;
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

/**
 * Le compte TOTAL de containers à annoncer (route dépréciée) — sans muter.
 *
 * Refuse tout ce que {@link sheetToCount} refuse, et un nombre qui n'est pas un
 * nombre de bacs ({@link assertContainerCount}). La route `PUT` reste servie un
 * déploiement de plus : elle est en production.
 *
 * @throws {InvalidContainerCountError} ce n'est pas un nombre de bacs.
 */
export function containersToDeclare(
  state: PackingState,
  reference: string,
  containers: number,
): ProductionOrderSnapshot {
  const sheet = sheetToCount(state, reference);
  assertContainerCount(containers);
  return { ...sheet, containers };
}
