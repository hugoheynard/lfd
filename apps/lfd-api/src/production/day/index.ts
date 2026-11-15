/**
 * La porte de la journée (`day/`) : ce que les métiers du fournil — plan,
 * atelier, qualité, réassort — et les primitives d'impression lisent du noyau.
 * Tout le reste de `day/` est privé (plan
 * `documentation/fournil/plan-decoupage-du-fournil.md`, § 1 bis ; porte
 * `lint:production-subcontexts`).
 *
 * Ce fichier ne fait que réexporter, et rien de ce qu'il réexporte ne doit
 * charger un métier : un cycle d'imports à travers un `index.ts` rend une
 * classe `undefined` quand Nest lit ses métadonnées. `channels/` n'entre
 * pas par ici — il importe les fichiers de `day/` en direct.
 *
 * Et rien d'ici ne charge un canal (§ 1 bis) : un service qui lit un canal vit
 * dans le métier qui s'en sert, et lit ici les règles pures (`withSeals`,
 * `trancheThresholdsBySku`, `handoffOf`…) et les ports.
 */
export { GetProductionDayStatusQuery } from "./application/queries/get-production-day-status.query.js";
export { GetProductionDueThresholdsQuery } from "./application/queries/get-production-due-thresholds.query.js";
export {
  AUTOMATIC_SIGNER,
  signedBy,
  signedVerb,
  staffSigner,
} from "./domain/entities/plan-signer.js";
export type { PlanSigner } from "./domain/entities/plan-signer.js";
export type {
  PackedMark,
  ProducedItemSnapshot,
  ProductionLineSnapshot,
} from "./domain/entities/production-day.snapshot.js";
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
export { ProductionTrancheSettings } from "./domain/entities/production-tranche-settings.js";
export {
  AtelierSheetNotFoundError,
  PlanClosedBeforeOrderCutoffError,
  ProductionDayEmptyError,
  ProductionDayNotClosedError,
} from "./domain/errors/production-errors.js";
export { ResupplyToLaunchNotFoundError } from "./domain/errors/resupply-launch-errors.js";
export {
  ProductionDayClosedJournalEvent,
  ProductionDayReopenedJournalEvent,
  ProductionDayRetakenJournalEvent,
  ProductionResupplyLaunchedJournalEvent,
} from "./domain/events/production-day.events.js";
export { ProductionTrancheSettingsUpdatedEvent } from "./domain/events/production-tranche-settings.events.js";
export { OrderWithdrawalsReader } from "./domain/ports/order-withdrawals.reader.js";
export { ProductionBatchRepository } from "./domain/ports/production-batch.repository.js";
export { ProductionHandoffLedger } from "./domain/ports/production-handoff.ledger.js";
export { ProductionHandoffReader } from "./domain/ports/production-handoff.reader.js";
export { ProductionReturnRequests } from "./domain/ports/production-return.requests.js";
export type { AnsweredReturn, ReturnRequest } from "./domain/ports/production-return.requests.js";
export { ProductionDayStatusReader } from "./domain/ports/production-day-status.reader.js";
export { ProductionDayLock } from "./domain/ports/production-day.lock.js";
export { ProductionDayRepository } from "./domain/ports/production-day.repository.js";
export { ProductionTrancheSettingsReader } from "./domain/ports/production-tranche-settings.reader.js";
export { ProductionTrancheSettingsRepository } from "./domain/ports/production-tranche-settings.repository.js";
export type { TrancheSettingsAuthor } from "./domain/ports/production-tranche-settings.repository.js";
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
export type { OrderOutOfHand } from "./domain/services/order-out-of-hand.js";
export { withSeals } from "./domain/services/packing-overlay.js";
export type { SealedOrders } from "./domain/services/packing-overlay.js";
export { countOf } from "./domain/services/production-count.js";
export { deadlinesOf } from "./domain/services/production-deadlines.js";
export { handedShareOf } from "./domain/services/on-site-share.js";
export { arrivalsBetween, handoffOf, returnOf } from "./domain/services/production-handoff.js";
export type { ProductionHandoff } from "./domain/services/production-handoff.js";
export { activeBatchesOf, countedBatch, outputOf } from "./domain/services/production-output.js";
export type { TrancheThreshold } from "./domain/services/production-tranches.js";
export { trancheThresholdsBySku } from "./domain/services/tranche-thresholds-by-sku.js";
export { relativeDayOf, todayOf, tomorrowOf } from "./domain/services/relative-day.js";
export { ServiceDay } from "./domain/value-objects/service-day.value-object.js";
export { ServiceRange } from "./domain/value-objects/service-range.value-object.js";
export type { PackingOwner } from "./domain/value-objects/packing-owner.js";
export { ShipmentRef } from "./domain/value-objects/shipment-ref.value-object.js";
export { dayLockKey } from "./infrastructure/prisma-production-day.lock.js";
export { productionSaleUnitOf } from "./infrastructure/sale-unit.column.js";
