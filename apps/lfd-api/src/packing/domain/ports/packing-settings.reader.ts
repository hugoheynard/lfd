import type { PackingSettings } from "../entities/packing-settings.js";

/**
 * Port de **lecture** des réglages du colisage. `null` : personne ne les a
 * encore posés — l'appelant applique {@link PackingSettings.defaults}, et peut
 * le dire à l'écran plutôt que de faire croire qu'on l'a choisi.
 */
export abstract class PackingSettingsReader {
  abstract current(): Promise<PackingSettings | null>;
}
