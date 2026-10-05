/**
 * **Le canal que la production publie POUR le colisage** (plan
 * `documentation/colisage/colisage.md`, §11–§13).
 *
 * | Pièce                   | Nature           | Ce qu'elle porte                              |
 * | ----------------------- | ---------------- | --------------------------------------------- |
 * | `PackingListDrawnEvent` | fait durable     | une commande à coliser, avec son échéance     |
 * | `HandedToPackingEvent`  | fait durable     | une fournée sortie = remise au colisage       |
 * | `ReturnRequestedEvent`  | fait durable     | une fournée remise, puis annulée              |
 * | `PackingReturnedEvent`  | fait durable     | la réponse du colisage à un retour            |
 * | `PackingOrderPackedEvent` | fait durable   | un bac fermé au colisage — lu par le commerce |
 * | `QualityHeldOrdersReader` | port publié (K3a) | les commandes retenues au contrôle, pour le poste |
 * | `PlannedDestinationsReader` | port publié (K3a) | la destination figée au plan, pour le poste |
 * | `PackedOrdersReader`    | port (K3a)       | « cette commande est-elle colisée ? »         |
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
export {
  PACKING_ORDER_PACKED,
  PackingOrderPackedEvent,
  PackingOrderPackedPayloadError,
} from "./packing-order-packed.event.js";
export {
  PACKING_RETURNED,
  PackingReturnedEvent,
  PackingReturnedPayloadError,
} from "./packing-returned.event.js";
export { PackingDayVersionReader } from "./packing-day-version.reader.js";
export { PackedOrdersReader, type PackedOrderSeal } from "./packed-orders.reader.js";
export { PlannedDestinationsReader } from "./planned-destinations.reader.js";
export { QualityHeldOrdersReader } from "./quality-held-orders.reader.js";
