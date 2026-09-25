import type { FloorClientele } from "../../domain/entities/pricing-floor.js";

/**
 * « Quelles limites protègent cette clientèle aujourd'hui ? » — la vue
 * Comptabilité › Limites de prix.
 */
export class ListPriceLimitsQuery {
  constructor(readonly clientele: FloorClientele) {}
}
