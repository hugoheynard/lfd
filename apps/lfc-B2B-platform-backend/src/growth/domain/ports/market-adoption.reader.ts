import type { MarketAdoptionView } from "@lfd/contracts";

/**
 * Port **MarketAdoptionReader** — l'adoption par territoire (pénétration = sociétés
 * activées / acteurs visés, + delta sur la période). Compose la config marché et
 * l'état d'activation des sociétés.
 */
export abstract class MarketAdoptionReader {
  abstract load(): Promise<MarketAdoptionView>;
}
