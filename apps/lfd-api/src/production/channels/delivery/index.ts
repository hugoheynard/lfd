/**
 * **Le canal que la production publie POUR la livraison** (2026-10-04, Hugo,
 * option B — `documentation/livraisons/tournees/composition-automatique.md`, §2.2).
 *
 * Deux faits : la clôture d'une journée, qui fige les commandes à livrer, et
 * son retirage (§16.5, CA6b), qui en ajoute. La livraison s'y abonne ; le
 * détail des commandes (adresses, échéances), elle le lit au commerce, qui en
 * est le propriétaire. `lint:context-boundaries` n'autorise
 * `delivery → production` que par ce dossier, et `production → delivery`
 * jamais.
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
