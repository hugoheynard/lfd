import type { ProductionTrancheSettings } from "../entities/production-tranche-settings.js";

/**
 * Port de **lecture** des tranches de production. `null` : personne ne les a
 * posées — l'appelant applique {@link ProductionTrancheSettings.defaults}.
 */
export abstract class ProductionTrancheSettingsReader {
  abstract current(): Promise<ProductionTrancheSettings | null>;
}
