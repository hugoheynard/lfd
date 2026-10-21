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
export {
  type Clientele,
  DayOrdersReader,
  type OrderSheetDetails,
  type ProducibleLine,
  type ProducibleOrder,
  type SheetAddress,
  type SheetContact,
  type SheetWindow,
} from "./day-orders.reader.js";
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
// Le bac fermé AU COLISAGE : déclaré dans le canal du colisage, relu ici par
// le commerce, dont la seule surface vers le fournil est ce dossier. Le seul
// fait « bac fait » depuis K3c (`production.order_packed` est retiré).
export {
  PACKING_ORDER_PACKED,
  PackingOrderPackedEvent,
  PackingOrderPackedPayloadError,
} from "../packing/packing-order-packed.event.js";
export { WorkshopShelvesReader } from "./workshop-shelves.reader.js";
export {
  DueThresholdsReader,
  type DayDueThresholds,
  type DueThreshold,
  type DueThresholdKind,
  type SkuDueThresholds,
} from "./due-thresholds.reader.js";
// L'heure limite générale, qui déclenche l'arrêt automatique du plan (2026-10-21).
export { OrderCutoffRulesReader } from "./order-cutoff-rules.reader.js";
export type { OrderCutoffRule } from "../../domain/services/latest-order-cutoff.js";
// Le réassort au plan figé (lot R3a, 2026-10-21) : l'heure du réassort, qui
// repousse l'arrêt, et les réassorts envoyés pour la journée, figés à l'arrêt.
export { ResupplyCutoffTimeReader } from "./resupply-cutoff-time.reader.js";
export {
  DayResuppliesReader,
  type PlacedResupply,
  type PlacedResupplyLine,
} from "./day-resupplies.reader.js";
// L'annulation staff (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C3.4,
// 2026-10-12) : deux ports que le fournil DÉCLARE et IMPLÉMENTE pour le
// commerce — retirer une commande sous le verrou de la journée, et dire si
// elle est inscrite (affichage).
export { OrderWithdrawalDesk, type OrderWithdrawalOutcome } from "./order-withdrawal.desk.js";
export { OrderInscriptionReader } from "./order-inscription.reader.js";
// L'arrêt du plan devient une limite (lot O3 de
// `documentation/commandes/plan-reglages-commandes.md`, 2026-10-14) : deux
// ports que le fournil DÉCLARE et IMPLÉMENTE — lire les journées arrêtées
// (proposer, refuser tôt), et admettre une commande sous le verrou de la journée.
export { ClosedPlansReader } from "./closed-plans.reader.js";
export { PlanAdmissionDesk, type PlanAdmission } from "./plan-admission.desk.js";
// La réouverture d'une journée (Hugo, 2026-10-14) : le fait que le commerce
// écoute pour rendre `placed` les commandes que l'arrêt défait avait confirmées.
export {
  PRODUCTION_DAY_REOPENED,
  ProductionDayReopenedEvent,
  ProductionDayReopenedPayloadError,
} from "./production-day-reopened.event.js";
