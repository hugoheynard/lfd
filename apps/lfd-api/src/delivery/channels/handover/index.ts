/**
 * **Le canal que la livraison publie POUR le retrait** (2026-10-01,
 * `a-la-porte.md`, BQ) : des classes abstraites qu'il implémente.
 *
 * | Pièce                     | La question / l'annonce                     |
 * | ------------------------- | ------------------------------------------- |
 * | `DepartureHoldsReader`    | « lesquelles sont retenues ? », au départ   |
 * | `DepartedOrdersAnnouncer` | « elles sont parties », après la validation |
 * | `DoorstepHandoverAttestor`| « atteste cette remise », à la porte (B1)   |
 * | `BroughtBackOrdersAnnouncer` | « elles sont revenues », rapportées (B3) |
 * | `RoundPlacementsReader`   | « quelle tournée, quel rang ? » — implémenté par la livraison elle-même (2026-10-06) |
 *
 * `lint:context-boundaries` n'autorise `handover → delivery` que par ce
 * chemin ; `delivery → handover` reste interdit.
 */
export { DepartureHoldsReader } from "./departure-holds.reader.js";
export { DepartedOrdersAnnouncer } from "./departed-orders.announcer.js";
export { BroughtBackOrdersAnnouncer } from "./brought-back-orders.announcer.js";
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
