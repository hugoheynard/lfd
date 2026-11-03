/**
 * **Le canal que la production publie POUR la livraison** (2026-10-04, Hugo,
 * option B — `documentation/livraisons/tournees/composition-automatique.md`, §2.2).
 *
 * Ce qu'il porte (relu le 2026-11-03) : les faits de la clôture (qui fige les
 * commandes à livrer), du retirage (§16.5, CA6b, qui en ajoute), de la
 * réouverture et du lancement « au plus tôt » ; les lecteurs des plans
 * arrêtés, de l'avancement du départ et des réassorts figés ; et la tenue du
 * plan arrêté (`ArrestedPlanHold`). Le détail des commandes (adresses,
 * échéances), la livraison le lit au commerce, qui en est le propriétaire.
 * `lint:context-boundaries` n'autorise `delivery → production` que par ce
 * dossier, et `production → delivery` jamais.
 */
export {
  PRODUCTION_DAY_CLOSED,
  ProductionDayClosedEvent,
  ProductionDayClosedPayloadError,
} from "../commerce/production-day-closed.event.js";
export {
  PRODUCTION_DAY_RETAKEN,
  ProductionDayRetakenEvent,
  ProductionDayRetakenPayloadError,
} from "./production-day-retaken.event.js";
// La réouverture (Hugo, 2026-10-14) : le fait, la question que le fournil
// pose avant de rouvrir, et l'état des plans pour ne défaire qu'un plan qui
// n'a pas été arrêté de nouveau depuis.
export {
  PRODUCTION_DAY_REOPENED,
  ProductionDayReopenedEvent,
  ProductionDayReopenedPayloadError,
} from "../commerce/production-day-reopened.event.js";
export { ClosedPlansReader } from "../commerce/closed-plans.reader.js";
export { DayDispatchProgressReader } from "./day-dispatch-progress.reader.js";
// Tenir le plan arrêté pendant un chargement ou un départ (2026-11-02) : la
// même déclaration que pour le colisage, une seule implémentation au fournil.
export { ArrestedPlanHold, type PlanHoldState } from "../packing/arrested-plan.hold.js";
// Le réassort (lot R3c, 2026-10-21) : la copie figée à l'arrêt, que la
// livraison lit pour attacher un réassort au transfert de son point.
export {
  FrozenResuppliesReader,
  type FrozenResupply,
  type FrozenResupplyLine,
} from "./frozen-resupplies.reader.js";
// Le réassort « au plus tôt » lancé (R4c, 2026-10-22) : la livraison l'attache
// au transfert non parti de son point et le place, comme le soir — et apprend
// l'arrêt d'une journée que ce lancement a ouverte (`openedPlan`).
export {
  PRODUCTION_RESUPPLY_LAUNCHED,
  ResupplyLaunchedEvent,
  ResupplyLaunchedPayloadError,
} from "../commerce/resupply-launched.event.js";
// L'envoi `(commande, rang)` (plan E7 reliquat, L3a, 2026-10-26) : une seule
// définition, réexportée par chaque canal du fournil, comme `ServiceDay`.
export {
  FIRST_SHIPMENT_RANK,
  ShipmentRef,
  shipmentKeySuffix,
  shipmentRankOf,
} from "../../domain/value-objects/shipment-ref.value-object.js";
