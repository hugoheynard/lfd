/**
 * **Le canal que la production publie POUR le colisage** (plan
 * `documentation/colisage/colisage.md`, §11–§13).
 *
 * | Pièce                   | Nature           | Ce qu'elle porte                              |
 * | ----------------------- | ---------------- | --------------------------------------------- |
 * | `PackingListDrawnEvent` | fait durable     | une commande à coliser, avec son échéance     |
 * | `ResupplyListDrawnEvent` | fait durable    | un réassort à coliser (point servi par transfert, R3b) |
 * | `ResupplyLaunchedEvent` | fait durable     | un réassort « au plus tôt » lancé (R4a), colisé s'il part par transfert (R4b) |
 * | `HandedToPackingEvent`  | fait durable     | une fournée sortie = remise au colisage       |
 * | `ReturnRequestedEvent`  | fait durable     | une fournée remise, puis annulée              |
 * | `PackingReturnedEvent`  | fait durable     | la réponse du colisage à un retour            |
 * | `PackingOrderPackedEvent` | fait durable   | un bac fermé au colisage — lu par le commerce |
 * | `QualityHeldOrdersReader` | port publié (K3a) | les commandes retenues au contrôle, pour le poste |
 * | `PlannedDestinationsReader` | port publié (K3a) | la destination figée au plan, pour le poste |
 * | `PackedOrdersReader`    | port (K3a)       | « cette commande est-elle colisée ? »         |
 * | `OvenWaitingOrdersReader` | port (2026-10-28) | les commandes qui attendent le four, par SKU — pour la fiche |
 * | `InscribedOrderHeaderReader` | port publié (A1) | l'en-tête figé d'une commande, pour la pierre tombale |
 * | `OrderLabelHeadReader`  | port publié      | l'acheminement et le créneau, pour l'étiquette d'un sac |
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
  PRODUCTION_RESUPPLY_LIST_DRAWN,
  ResupplyListDrawnEvent,
  ResupplyListDrawnPayloadError,
  type ResupplyListLine,
  type ResupplyToPack,
} from "./resupply-list-drawn.event.js";
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
export { OvenWaitingOrdersReader, type OvenWaitingOrders } from "./oven-waiting-orders.reader.js";
export { PlannedDestinationsReader } from "./planned-destinations.reader.js";
export { QualityHeldOrdersReader } from "./quality-held-orders.reader.js";
export {
  InscribedOrderHeaderReader,
  type InscribedOrderHeader,
} from "./inscribed-order-header.reader.js";
export { OrderLabelHeadReader, type OrderLabelHead } from "./order-label-head.reader.js";
// La réouverture (Hugo, 2026-10-14) : même figure que pour la livraison.
export {
  PRODUCTION_DAY_REOPENED,
  ProductionDayReopenedEvent,
  ProductionDayReopenedPayloadError,
} from "../commerce/production-day-reopened.event.js";
export { ClosedPlansReader } from "../commerce/closed-plans.reader.js";
// Le réassort « au plus tôt » lancé (R4a) : le même fait que le commerce lit,
// que le colisage écoute à son tour (R4b) — un fait, plusieurs abonnés.
export {
  PRODUCTION_RESUPPLY_LAUNCHED,
  ResupplyLaunchedEvent,
} from "../commerce/resupply-launched.event.js";
export { DayPackingProgressReader } from "./day-packing-progress.reader.js";
// L'envoi `(commande, rang)` (plan E7 reliquat, L3a, 2026-10-26) : une seule
// définition, réexportée par chaque canal du fournil, comme `ServiceDay`.
export {
  FIRST_SHIPMENT_RANK,
  ShipmentRef,
  shipmentKeySuffix,
  shipmentRankOf,
} from "../../domain/value-objects/shipment-ref.value-object.js";
