/**
 * **Le canal que la livraison publie POUR le retrait** (2026-10-01,
 * `a-la-porte.md`, BQ) : des classes abstraites qu'il implémente.
 *
 * | Pièce                     | La question / l'annonce                     |
 * | ------------------------- | ------------------------------------------- |
 * | `DepartureHoldsReader`    | « lesquelles sont retenues ? », au départ   |
 * | `DeliveryRoundDepartedFact` | fait durable : « elles sont parties » (DD1) |
 * | `DoorstepHandoverAttestor`| « atteste cette remise », à la porte (B1)   |
 * | `DeliveryOrdersBroughtBackFact` | fait durable : « elles sont revenues » (B3, DD1) |
 * | `RoundPlacementsReader`   | « quelle tournée, quel rang ? » — implémenté par la livraison elle-même (2026-10-06) |
 *
 * `lint:context-boundaries` n'autorise `handover → delivery` que par ce
 * chemin ; `delivery → handover` reste interdit.
 */
export { DepartureHoldsReader } from "./departure-holds.reader.js";
// Les deux faits durables (2026-10-06, `plan-depart-durable.md`, DD1) : ils
// remplacent les annonces `DepartedOrdersAnnouncer` / `BroughtBackOrdersAnnouncer`,
// appelées en mémoire après la validation et perdues à un redémarrage.
export {
  DELIVERY_ROUND_DEPARTED,
  DeliveryRoundDepartedFact,
  DeliveryRoundDepartedPayloadError,
} from "./delivery-round-departed.fact.js";
export {
  DELIVERY_ORDERS_BROUGHT_BACK,
  DeliveryOrdersBroughtBackFact,
  DeliveryOrdersBroughtBackPayloadError,
} from "./delivery-orders-brought-back.fact.js";
export {
  DoorstepHandoverAttestor,
  type DoorstepHandoverRequest,
  type DoorstepProofImage,
  type DoorstepProofImages,
  type HandoverPublication,
  type StagedHandoverProofs,
} from "./doorstep-handover.attestor.js";
export {
  RoundPlacementsReader,
  type RoundPlacement,
  type RoundPlacements,
} from "./round-placements.reader.js";
