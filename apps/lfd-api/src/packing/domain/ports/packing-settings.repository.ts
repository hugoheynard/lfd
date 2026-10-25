import type { PackingSettings } from "../entities/packing-settings.js";

/** Port d'**écriture** des réglages du colisage : une ligne, remplacée, auteur figé. */
export abstract class PackingSettingsRepository {
  abstract save(settings: PackingSettings, at: Date, staffUserId: string): Promise<void>;
}
