import type { ProductionDisplaySettings } from "../entities/production-display-settings.js";
import type { TrancheSettingsAuthor } from "../../../day/index.js";

/** Port d'**écriture** du rangement du fournil : une ligne, remplacée, auteur figé. */
export abstract class ProductionDisplaySettingsRepository {
  abstract save(
    settings: ProductionDisplaySettings,
    at: Date,
    author: TrancheSettingsAuthor,
  ): Promise<void>;
}
