/**
 * **Le canal que la production publie POUR le colisage** (plan
 * `documentation/colisage/plan-domaine-colisage.md`, §11–§13).
 *
 * | Pièce                   | Nature           | Ce qu'elle porte                              |
 * | ----------------------- | ---------------- | --------------------------------------------- |
 * | `PackingListDrawnEvent` | fait durable     | une commande à coliser, avec son échéance     |
 * | `HandedToPackingEvent`  | fait durable     | une fournée sortie = remise au colisage       |
 * | `ReturnRequestedEvent`  | fait durable     | une fournée remise, puis annulée              |
 * | `LegacyPackingReader`   | port publié (K1) | le colisable de l'ancien chemin, pour comparer |
 *
 * `lint:context-boundaries` n'autorise `packing → production` que par ce
 * dossier, et `production → packing` jamais : le fournil publie, il ne sait
 * pas qui écoute.
 */
export {
  HandedToPackingEvent,
  HandedToPackingPayloadError,
  PRODUCTION_HANDED_TO_PACKING,
} from "./handed-to-packing.event.js";
export {
  LegacyPackingReader,
  type LegacyPackingDay,
  type LegacyPackingOrder,
} from "./legacy-packing.reader.js";
export {
  PRODUCTION_PACKING_LIST_DRAWN,
  PackingListDrawnEvent,
  PackingListDrawnPayloadError,
  type PackingListLine,
  type PackingListOrder,
} from "./packing-list-drawn.event.js";
export {
  PRODUCTION_RETURN_REQUESTED,
  ReturnRequestedEvent,
  ReturnRequestedPayloadError,
} from "./return-requested.event.js";
