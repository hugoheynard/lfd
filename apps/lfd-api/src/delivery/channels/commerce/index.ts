/**
 * **Le canal que la livraison publie POUR le commerce** : des classes
 * abstraites qu'il implémente. `lint:context-boundaries` n'autorise
 * `b2b → delivery` que par ce chemin.
 *
 * Depuis le 2026-10-08, il porte aussi l'autre sens : `OrderDeliveryHistoryReader`
 * est déclaré ET implémenté par la livraison, et lu par la comptabilité du
 * commerce pour l'historique des bons (plan simulateur de dossier de
 * facturation, DF3).
 */
export {
  DepartureCandidatesReader,
  type DepartureCandidate,
} from "./departure-candidates.reader.js";
// Déclaré ET implémenté par la livraison, lu par le commerce (2026-10-13).
export { DepartureSiteReader } from "./departure-site.reader.js";
// Déclaré ET implémenté par la livraison, lu par le commerce (T0, 2026-10-13).
export { RoadTravelTimeReader } from "./road-travel-time.reader.js";
export {
  DeliveryOrdersReader,
  type DeliveryOrderFacts,
  type DeliveryOrderRef,
  type DeliveryStopPoint,
  type DeliveryStopWindow,
} from "./delivery-orders.reader.js";
export { DeliveryOrderLinesReader, type DeliveryOrderLine } from "./delivery-order-lines.reader.js";
export {
  DeliveryDeparturesReader,
  type DeliveryAbandonedLine,
  type DeliveryDeparture,
  type DeliveryShortfall,
} from "./delivery-departures.reader.js";
export { DeliveryProductsReader, type DeliveryProduct } from "./delivery-products.reader.js";
export {
  DeliveryProceduresReader,
  type DeliveryOrderProcedure,
  type DeliveryProcedureStep,
} from "./delivery-procedures.reader.js";
export { DeliveryStepPhotosReader } from "./delivery-step-photos.reader.js";
export {
  DeliveryOrderStatesReader,
  type DeliveryOrderState,
} from "./delivery-order-states.reader.js";
export { CommerceDayVersionReader } from "./commerce-day-version.reader.js";
// Le départ, fait durable (2026-10-06, DD1) : déclaré dans le canal du
// retrait, la MÊME classe réexportée ici — le commerce n'a que ce dossier
// comme surface vers la livraison. Remplace `DeliveryDepartureAnnouncer`.
export {
  DELIVERY_ROUND_DEPARTED,
  DeliveryRoundDepartedFact,
  DeliveryRoundDepartedPayloadError,
} from "../handover/delivery-round-departed.fact.js";
export type { DepartureSheet, DepartureWindow } from "../../domain/entities/departure-sheet.js";
// « Commande passée », fait durable (2026-10-07) : déclaré ici, écrit par le
// commerce dans la transaction de la passation. Remplace `DeliveryOrderPlacedListener`.
export {
  COMMERCE_ORDER_PLACED,
  CommerceOrderPlacedFact,
  CommerceOrderPlacedPayloadError,
} from "./commerce-order-placed.fact.js";
// « Commande annulée », fait durable (lot T2, 2026-10-13) : déclaré ici, écrit
// par le commerce à chaque annulation — la commande sort de son transfert prévu.
export {
  COMMERCE_ORDER_CANCELLED,
  CommerceOrderCancelledFact,
  CommerceOrderCancelledPayloadError,
} from "./commerce-order-cancelled.fact.js";
// « Commande modifiée », fait durable (plan de modification, M1, 2026-10-23) :
// déclaré ici, écrit par le commerce à chaque révision — la commande qui
// change d'acheminement est reprise comme à la passation.
export {
  COMMERCE_ORDER_REVISED,
  CommerceOrderRevisedFact,
  CommerceOrderRevisedPayloadError,
} from "./commerce-order-revised.fact.js";
export {
  DeliveryAddressPointsReader,
  type DeliveryOrderAddress,
} from "./delivery-address-points.reader.js";
export {
  DeliveryAddressPointCorrector,
  type DeliveryAddressPointCorrection,
} from "./delivery-address-point.corrector.js";
// Le transfert interne (lot T1, 2026-10-13) : la livraison déclare, le commerce implémente.
export {
  TransferOrdersReader,
  TransferSitePlacesReader,
  TransferSitesReader,
  type TransferOrderRef,
  type TransferSiteFacts,
  type TransferSitePlace,
} from "./transfer-sites.reader.js";
// Les couleurs de livraison du départ, pour le papier (plan du tri et des couleurs, L5).
export { DeliveryColorsReader, type DeliveryColors } from "./delivery-colors.reader.js";
// La pastille par commande du transfert interne imprimé (2026-10-22).
export { TransferOrderColorsReader } from "./transfer-order-colors.reader.js";
export { BinLabelColorsReader } from "./bin-label-colors.reader.js";
// La teinte de transfert des sites, pour la répartition du dossier des tournées (2026-10-26).
export { TransferSiteColorsReader } from "./transfer-site-colors.reader.js";
export {
  type TransferOrderCategory,
  TransferOrderContentsReader,
} from "./transfer-order-contents.reader.js";
export {
  OrderDeliveryHistoryReader,
  type OrderDeliveryStopFact,
} from "./order-delivery-history.reader.js";
// « Transfert reçu », fait durable (lot R3e, 2026-10-22) : déclaré ET écrit
// par la livraison, entendu par le commerce — ses réassorts sont arrivés.
export {
  DELIVERY_TRANSFER_RECEIVED,
  TransferReceivedFact,
  TransferReceivedPayloadError,
} from "./transfer-received.fact.js";
// « Transfert parti », fait durable (lot R4d, 2026-10-22) : déclaré ET écrit
// par la livraison au départ de la tournée, entendu par le commerce — ses
// réassorts sont partis (un affichage).
export {
  DELIVERY_TRANSFER_DEPARTED,
  TransferDepartedFact,
  TransferDepartedPayloadError,
} from "./transfer-departed.fact.js";
