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
export {
  DeliveryOrdersReader,
  type DeliveryOrderFacts,
  type DeliveryOrderRef,
  type DeliveryStopPoint,
  type DeliveryStopWindow,
} from "./delivery-orders.reader.js";
export { DeliveryOrderLinesReader, type DeliveryOrderLine } from "./delivery-order-lines.reader.js";
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
export {
  DeliveryAddressPointsReader,
  type DeliveryOrderAddress,
} from "./delivery-address-points.reader.js";
export {
  DeliveryAddressPointCorrector,
  type DeliveryAddressPointCorrection,
} from "./delivery-address-point.corrector.js";
export {
  OrderDeliveryHistoryReader,
  type OrderDeliveryStopFact,
} from "./order-delivery-history.reader.js";
