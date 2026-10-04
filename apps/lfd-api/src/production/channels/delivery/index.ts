/**
 * **Le canal que la production publie POUR la livraison** (2026-10-04, Hugo,
 * option B — `documentation/livraisons/plan-composition-automatique.md`, §15).
 *
 * Un seul fait : la clôture d'une journée, qui fige les commandes à livrer.
 * La livraison s'y abonne ; le détail des commandes (adresses, échéances), elle
 * le lit au commerce, qui en est le propriétaire. `lint:context-boundaries`
 * n'autorise `delivery → production` que par ce dossier, et
 * `production → delivery` jamais.
 */
export {
  PRODUCTION_DAY_CLOSED,
  ProductionDayClosedEvent,
  ProductionDayClosedPayloadError,
} from "../commerce/production-day-closed.event.js";
