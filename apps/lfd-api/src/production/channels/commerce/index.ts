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
 */
export { DayOrdersReader, type ProducibleLine, type ProducibleOrder } from "./day-orders.reader.js";
export { ServiceDay } from "../../domain/value-objects/service-day.value-object.js";
export { ProductionDayClosedEvent } from "./production-day-closed.event.js";
export { PendingCommerceOrdersReader } from "./pending-orders.reader.js";
export { OrderPackedEvent } from "./order-packed.event.js";
export {
  HandoverSubjectReader,
  type HandoverSubject,
  type HandoverSubjectLine,
} from "./handover-subject.reader.js";
export { OrderHandedOverEvent } from "./order-handed-over.event.js";
export type { HandoverVia } from "../../domain/services/handover.js";
