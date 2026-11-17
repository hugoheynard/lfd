import type { TrancheSettingsAuthor } from "../../../day/index.js";
import type { ProductionTrackingSettings } from "../entities/production-tracking-settings.js";

/**
 * Port de **lecture** du niveau de suivi du fournil. `null` : personne ne l'a
 * posé — l'appelant applique {@link ProductionTrackingSettings.defaults}.
 */
export abstract class ProductionTrackingSettingsReader {
  abstract current(): Promise<ProductionTrackingSettings | null>;
}

/** Port d'**écriture** du niveau de suivi du fournil : une ligne, remplacée, auteur figé. */
export abstract class ProductionTrackingSettingsRepository {
  abstract save(
    settings: ProductionTrackingSettings,
    at: Date,
    author: TrancheSettingsAuthor,
  ): Promise<void>;
}

/**
 * **« Le réglage de suivi a-t-il changé ? »** — un numéro que la fiche gardée
 * met dans son étiquette (`WorksheetContents`) : une journée pas encore figée
 * sert le réglage courant, qui n'écrit aucun journal de journée. L'instant de
 * la dernière pose, en millisecondes ; `0` tant que personne ne l'a posé.
 */
export abstract class ProductionTrackingSettingsVersion {
  abstract versionOf(): Promise<number>;
}
