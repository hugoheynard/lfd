/**
 * La porte de la journée (`day/`) : le tronc sur lequel poussent les métiers du
 * fournil — plan, atelier, qualité, réassort — et les primitives d'impression.
 * Tout le reste de `day/` est privé (on y entre par cet
 * index, qui ne fait que réexporter : `documentation/fournil/architecture-contexte-production.md`, « Les règles de la surface » ; porte
 * `lint:production-subcontexts`, qui compte aussi la taille de cet index).
 *
 * Un métier neuf lit les sections dans l'ordre : la journée et ses valeurs, ce
 * qu'elle sait répondre, ce qu'on y écrit, ses règles, ses faits, ses refus.
 * Un nom n'entre ici que si un autre métier le lit ; ce qu'un seul métier lit
 * et qui est sa règle vit chez lui.
 *
 * Ce fichier ne fait que réexporter, et rien de ce qu'il réexporte ne doit
 * charger un métier : un cycle d'imports à travers un `index.ts` rend une
 * classe `undefined` quand Nest lit ses métadonnées. Et rien d'ici ne charge un
 * canal (§ 1 bis) : `channels/` importe les fichiers de `day/` en direct, et un
 * service qui lit un canal vit dans le métier qui s'en sert.
 */

/**
 * ## La journée et ses valeurs
 *
 * L'agrégat (en type : on le charge par le dépôt, jamais on ne le construit),
 * ses instantanés, et les valeurs qui le désignent — le jour de service, une
 * plage de jours, un envoi, qui signe une décision.
 */
export { NOTHING_PENDING } from "./domain/entities/production-day.js";
export type {
  DownstreamProgress,
  PendingPlan,
  ProductionBatchSnapshot,
  ProductionDay,
  ProductionDaySnapshot,
  ProductionOrderSnapshot,
  ProductionResupplySnapshot,
  ResupplyLaunchGesture,
} from "./domain/entities/production-day.js";
export type {
  PackedMark,
  ProducedItemSnapshot,
  ProductionLineSnapshot,
} from "./domain/entities/production-day.snapshot.js";
export {
  AUTOMATIC_SIGNER,
  signedBy,
  signedVerb,
  staffSigner,
} from "./domain/entities/plan-signer.js";
export type { PlanSigner } from "./domain/entities/plan-signer.js";
export { ProductionTrancheSettings } from "./domain/entities/production-tranche-settings.js";
export { ServiceDay } from "./domain/value-objects/service-day.value-object.js";
export { ServiceRange } from "./domain/value-objects/service-range.value-object.js";
export { ShipmentRef } from "./domain/value-objects/shipment-ref.value-object.js";
export type { PackingOwner } from "./domain/value-objects/packing-owner.js";
export type { OrderOutOfHand } from "./domain/services/order-out-of-hand.js";

/**
 * ## Ce que la journée sait répondre
 *
 * Les lectures nommées que le noyau publie et implémente sur ses tables : un
 * port étroit par question. Un métier qui a besoin d'une table du noyau
 * demande une lecture ici, il ne lit pas la table.
 */
export { ProductionDayStatusReader } from "./domain/ports/production-day-status.reader.js";
export { CountedProductNameReader } from "./domain/ports/counted-product-name.reader.js";
export { ProductionHandoffReader } from "./domain/ports/production-handoff.reader.js";
export { OrderWithdrawalsReader } from "./domain/ports/order-withdrawals.reader.js";
export { ProductionTrancheSettingsReader } from "./domain/ports/production-tranche-settings.reader.js";
export { GetProductionDueThresholdsQuery } from "./application/queries/get-production-due-thresholds.query.js";
/** Le compte, les réassorts et les feuilles des plans arrêtés d'une plage (le prévisionnel du plan). */
export { ArrestedPlanLinesReader } from "./domain/ports/arrested-plan-lines.reader.js";
/** Les lignes du plan de ces commandes qui portent ces articles (la retenue de la qualité). */
export { PlannedOrderLinesReader } from "./domain/ports/planned-order-lines.reader.js";
/** Un réassort est-il lancé au plan de la journée, sous le verrou de l'appelant (le réassort). */
export { LaunchedResupplyLookup } from "./domain/ports/launched-resupply.lookup.js";
/** Le SKU et le nom des lignes des journées arrêtées d'une plage (la page Postes, l'alerte). */
export { KnownArticles } from "./domain/ports/known-articles.reader.js";

/**
 * ## Ce qu'on écrit
 *
 * Le dépôt de l'agrégat (charger, muter par une méthode métier, sauver), le
 * verrou d'une journée, et les registres que l'atelier et le plan tiennent sur
 * elle. Toute écriture qui peut être refusée passe par l'agrégat.
 */
export { ProductionDayRepository } from "./domain/ports/production-day.repository.js";
export { ProductionDayLock } from "./domain/ports/production-day.lock.js";
export { ProductionBatchRepository } from "./domain/ports/production-batch.repository.js";
export { ProductionHandoffLedger } from "./domain/ports/production-handoff.ledger.js";
export { ProductionReturnRequests } from "./domain/ports/production-return.requests.js";
export { ProductionTrancheSettingsRepository } from "./domain/ports/production-tranche-settings.repository.js";
export type { TrancheSettingsAuthor } from "./domain/ports/production-tranche-settings.repository.js";

/**
 * ## Les règles
 *
 * Des fonctions pures : l'heure d'arrêt du plan, le compte, la production
 * faite, les paliers d'une ligne, la remise et la reprise d'une fournée, le
 * jour relatif. Un métier les appelle au lieu de recopier la règle.
 */
export {
  latestOrderCutoff,
  planStopOf,
  planStopRules,
  planStopsAt,
} from "./domain/services/latest-order-cutoff.js";
export type {
  OrderCutoffRule,
  PlanStop,
  PlanStopRule,
} from "./domain/services/latest-order-cutoff.js";
export { withSeals } from "./domain/services/packing-overlay.js";
export { countOf } from "./domain/services/production-count.js";
export { activeBatchesOf, countedBatch, outputOf } from "./domain/services/production-output.js";
export { deadlinesOf } from "./domain/services/production-deadlines.js";
export type { TrancheThreshold } from "./domain/services/production-tranches.js";
export { trancheThresholdsBySku } from "./domain/services/tranche-thresholds-by-sku.js";
export { arrivalsBetween, handoffOf, returnOf } from "./domain/services/production-handoff.js";
export { relativeDayOf, todayOf, tomorrowOf } from "./domain/services/relative-day.js";

/**
 * ## Les faits
 *
 * Ce que la journée annonce quand son état change, dans son vocabulaire. Un
 * abonné d'un autre métier les écoute en `@DurableHandler`.
 */
export {
  ProductionDayClosedJournalEvent,
  ProductionDayReopenedJournalEvent,
  ProductionDayRetakenJournalEvent,
  ProductionResupplyLaunchedJournalEvent,
} from "./domain/events/production-day.events.js";
export { ProductionTrancheSettingsUpdatedEvent } from "./domain/events/production-tranche-settings.events.js";

/**
 * ## Les refus
 *
 * Ce que l'agrégat et ses règles refusent, pour qu'un métier les reconnaisse
 * (et qu'un test les attende) sans lire l'intérieur.
 */
export {
  AtelierSheetNotFoundError,
  PlanClosedBeforeOrderCutoffError,
  ProductionDayEmptyError,
  ProductionDayNotClosedError,
} from "./domain/errors/production-errors.js";
export { DuplicateTrancheError } from "./domain/errors/production-tranches-errors.js";
export {
  ReopenAfterDispatchError,
  ReopenAfterPackingError,
} from "./domain/errors/reopening-errors.js";
export {
  ResupplyAlreadyLaunchedError,
  ResupplyLaunchOnUnarrestedPlanError,
  ResupplyToLaunchNotFoundError,
} from "./domain/errors/resupply-launch-errors.js";
