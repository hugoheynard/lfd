/**
 * **Le canal que le retrait publie POUR le commerce.**
 *
 * Deux sens y passent, et ce n'est pas une incohérence :
 *
 * - `HandoverSubjectReader` est une classe **abstraite que le commerce
 *   implémente** — le retrait déclare ce dont il a besoin pour afficher et
 *   pour juger, il ne va pas le chercher ;
 * - `OrderHandedOverEvent` est un **fait qu'elle publie**, et que le commerce
 *   consomme pour basculer la commande en `fulfilled`.
 *
 * Les deux sont de la surface, donc les deux vivent ici : un événement qu'un
 * autre bloc consomme fait partie de ce qui est publié, au même titre qu'un
 * port. La porte l'a imposé une fois déjà, du côté du fournil.
 *
 * `lint:context-boundaries` n'autorise `b2b → handover` que par ce chemin.
 */
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
export { OrderHandedOverEvent } from "./order-handed-over.event.js";
export type { HandoverVia } from "../../domain/services/handover.js";
