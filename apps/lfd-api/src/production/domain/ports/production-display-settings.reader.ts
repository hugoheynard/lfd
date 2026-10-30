import type { ProductionDisplaySettings } from "../entities/production-display-settings.js";

/**
 * Port de **lecture** du rangement du fournil. `null` : personne ne l'a posé
 * — l'appelant applique {@link ProductionDisplaySettings.defaults}.
 */
export abstract class ProductionDisplaySettingsReader {
  abstract current(): Promise<ProductionDisplaySettings | null>;
}
