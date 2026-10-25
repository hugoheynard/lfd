/**
 * **Le canal que le colisage publie POUR le commerce** (réassort, lot R3b,
 * 2026-10-21 ; le manque, lot E6a, 2026-10-25).
 *
 * | Pièce                           | Nature                         | Ce qu'elle porte                        |
 * | ------------------------------- | ------------------------------ | --------------------------------------- |
 * | `PackedResuppliesReader`        | port déclaré ET implémenté ici | l'emballé d'un réassort, une fois clos  |
 * | `PackingShortfallReportedEvent` | fait durable publié ici        | « il manque » : les quantités au bac    |
 * | `PackingShortfallClearedEvent`  | fait durable publié ici        | le bac s'est fermé complet, signal levé |
 * | `ShortfallDesk`                 | port déclaré ET implémenté ici | le départ incomplet décidé (E6b)        |
 * | `PackingWithdrawalDesk`         | port déclaré ET implémenté ici | la feuille retirée par l'annulation (A1) |
 * | `OrderPackingStateReader`       | port déclaré ET implémenté ici | bac fermé, feuille retirée (A1.3)       |
 * | `DeliveryNoteReprintsReader`    | port déclaré ici, implémenté par le commerce | BL à réimprimer (§ 14) |
 * | `OrderBagLabelReader`           | port déclaré ici, implémenté par le commerce | couleur et QR de l'étiquette d'un sac |
 * | `ReserveShopRelease`            | port déclaré ET implémenté ici | la sortie de réserve en boutique (A1.4) |
 * | `PackingRevisionDesk`           | port déclaré ET implémenté ici | les lignes dues révisées après l'arrêt (A2) |
 *
 * `lint:context-boundaries` n'autorise `b2b → packing` que par ce dossier ;
 * `packing → b2b` reste interdit : le colisage ne sait pas qui le lit.
 */
export { PackedResuppliesReader, type PackedResupplyLines } from "./packed-resupplies.reader.js";
export {
  PACKING_SHORTFALL_REPORTED,
  PackingShortfallPayloadError,
  PackingShortfallReportedEvent,
  type ShortfallReportedLine,
} from "./packing-shortfall-reported.event.js";
export {
  PACKING_SHORTFALL_CLEARED,
  PackingShortfallClearedEvent,
} from "./packing-shortfall-cleared.event.js";
export { ShortfallDesk, type DepartingLine } from "./shortfall-desk.js";
export { PackingWithdrawalDesk, type PackingWithdrawalOutcome } from "./packing-withdrawal.desk.js";
export { OrderPackingStateReader, type OrderPackingState } from "./order-packing-state.reader.js";
export { DeliveryNoteReprintsReader } from "./delivery-note-reprints.reader.js";
export { OrderBagLabelReader, type OrderBagLabelFacts } from "./order-bag-label.reader.js";
export {
  ReserveShopRelease,
  type ShopRelease,
  type ShopReleaseLine,
} from "./reserve-shop-release.js";
export {
  PackingRevisionDesk,
  type PackingDueLine,
  type PackingRevisionOutcome,
} from "./packing-revision.desk.js";
