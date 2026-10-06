/**
 * **Le canal que la livraison publie POUR le commerce** : des classes
 * abstraites qu'il implémente. `lint:context-boundaries` n'autorise
 * `b2b → delivery` que par ce chemin.
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
export { DeliveryOrderPlacedListener } from "./delivery-order-placed.listener.js";
export {
  DeliveryAddressPointsReader,
  type DeliveryOrderAddress,
} from "./delivery-address-points.reader.js";
export {
  DeliveryAddressPointCorrector,
  type DeliveryAddressPointCorrection,
} from "./delivery-address-point.corrector.js";
