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
export { DeliveryProductsReader, type DeliveryProduct } from "./delivery-products.reader.js";
export type { DepartureSheet, DepartureWindow } from "../../domain/entities/departure-sheet.js";
