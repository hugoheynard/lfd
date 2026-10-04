/**
 * **Le canal que le retrait publie POUR le commerce.**
 *
 * Deux sens y passent, et ce n'est pas une incohérence :
 *
 * - `HandoverSubjectReader`, `HandoverQueueReader` et `DeliveryRunSheetReader`
 *   sont des classes **abstraites que le commerce implémente** — le retrait déclare ce dont il a besoin pour afficher et
 *   pour juger, il ne va pas le chercher ;
 * - `OrderHandedOverEvent` est un **fait qu'elle publie**, et que le commerce
 *   consomme pour basculer la commande en `fulfilled` — durable depuis le
 *   2026-10-04 (`handover.handed_over`, lot E2) ;
 * - `HandoverProofReader` (2026-10-02) est un port qu'elle publie ET
 *   implémente : le commerce y lit les preuves de remise à la porte, sans
 *   toucher à leur table ni à leurs clés.
 *
 * Les deux sont de la surface, donc les deux vivent ici : un événement qu'un
 * autre bloc consomme fait partie de ce qui est publié, au même titre qu'un
 * port. La porte l'a imposé une fois déjà, du côté du fournil.
 *
 * `lint:context-boundaries` n'autorise `b2b → handover` que par ce chemin.
 */
export {
  DeliveryRunSheetReader,
  type DeliveryRunSheetAddressBook,
  type DeliveryRunSheetEntry,
  type DeliveryRunSheetStep,
} from "./delivery-run-sheet.reader.js";
export {
  HandoverQueueReader,
  type HandoverQueueEntry,
  type HandoverWindow,
} from "./handover-queue.reader.js";
export {
  HandoverSubjectReader,
  type HandoverSubject,
  type HandoverSubjectLine,
} from "./handover-subject.reader.js";
export { HandoverProofReader } from "./handover-proof.reader.js";
export type {
  HandoverProofExhibit,
  HandoverProofMode,
  HandoverProofPieces,
} from "../../domain/services/handover-proof-exhibit.js";
export type { HandoverProofPiece } from "../../domain/value-objects/handover-proof-image.js";
export {
  HANDOVER_HANDED_OVER,
  OrderHandedOverEvent,
  OrderHandedOverPayloadError,
} from "./order-handed-over.event.js";
export type { HandoverVia } from "../../domain/services/handover.js";
