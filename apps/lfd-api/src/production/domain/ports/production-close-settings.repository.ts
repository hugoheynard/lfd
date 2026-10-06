import type { ProductionCloseSettings } from "../entities/production-close-settings.js";

/**
 * **Le réglage d'arrêt du plan**, côté écriture : on charge l'agrégat, il
 * juge, on le rend (§3.1).
 */
export abstract class ProductionCloseSettingsRepository {
  /** `null` : personne n'a encore réglé — le réglage de départ s'applique. */
  abstract load(): Promise<ProductionCloseSettings | null>;

  abstract save(settings: ProductionCloseSettings): Promise<void>;
}
