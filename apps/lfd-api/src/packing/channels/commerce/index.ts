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
 * | `DeliveryNoteReprintsReader`    | port déclaré ici, implémenté par le commerce | BL à réimprimer (§ 14) |
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
export { DeliveryNoteReprintsReader } from "./delivery-note-reprints.reader.js";
