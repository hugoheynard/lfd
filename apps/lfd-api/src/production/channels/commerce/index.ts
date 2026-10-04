/**
 * **Le canal que la production publie POUR le commerce.**
 *
 * Tout ce qui sort d'ici est fait pour être consommé de l'extérieur, et rien
 * d'autre ne doit l'être : `lint:context-boundaries` n'autorise `b2b →
 * production` que par ce chemin. Le reste du contexte — l'agrégat, les tables,
 * les règles de clôture — est son intérieur.
 *
 * Ce que le commerce y trouve : une classe abstraite à implémenter, et les faits
 * qu'elle rend. Aucune classe concrète, aucun accès aux tables.
 *
 * ⚠️ **Le retrait n'est plus ici** depuis le 2026-09-10. `HandoverSubjectReader`,
 * `OrderHandedOverEvent` et `HandoverVia` ont suivi leur contexte dans
 * `handover/channels/commerce/`. Ce fichier publiait deux surfaces sous un seul
 * nom, ce qui rendait la frontière illisible : le commerce importait « la
 * production » pour parler au retrait.
 */
export { DayOrdersReader, type ProducibleLine, type ProducibleOrder } from "./day-orders.reader.js";
export { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
export { ServiceRange } from "../../domain/value-objects/service-range.value-object.js";
export {
  ExpectedProductionReader,
  type ExpectedDayProduction,
  type ExpectedItem,
} from "./expected-production.reader.js";
export {
  PRODUCTION_DAY_CLOSED,
  ProductionDayClosedEvent,
  ProductionDayClosedPayloadError,
} from "./production-day-closed.event.js";
export { PendingCommerceOrdersReader } from "./pending-orders.reader.js";
export { PendingSettlementSweeper } from "./pending-settlement.sweeper.js";
export {
  OrderPackedEvent,
  OrderPackedPayloadError,
  PRODUCTION_ORDER_PACKED,
} from "./order-packed.event.js";
// Le bac fermé AU COLISAGE (K2) : déclaré dans le canal du colisage, relu ici
// par le commerce, dont la seule surface vers le fournil est ce dossier. Même
// charge que `production.order_packed` — `OrderPackedEvent.fromPayload` la lit.
export { PACKING_ORDER_PACKED } from "../packing/packing-order-packed.event.js";
export { WorkshopShelvesReader } from "./workshop-shelves.reader.js";
export {
  DueThresholdsReader,
  type DayDueThresholds,
  type DueThreshold,
  type DueThresholdKind,
  type SkuDueThresholds,
} from "./due-thresholds.reader.js";
