import type { QualityControlSettings } from "../entities/quality-control-settings.js";

/** Port d'**écriture** des réglages du contrôle qualité : une ligne, remplacée, auteur figé. */
export abstract class QualityControlSettingsRepository {
  abstract save(settings: QualityControlSettings, at: Date, staffUserId: string): Promise<void>;
}
