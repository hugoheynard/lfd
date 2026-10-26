import type { QualityControlSettings } from "../entities/quality-control-settings.js";

/**
 * Port de **lecture** des réglages du contrôle qualité. `null` : personne ne
 * les a encore posés — l'appelant applique {@link QualityControlSettings.defaults},
 * et peut le dire à l'écran plutôt que de faire croire qu'on l'a choisi.
 */
export abstract class QualityControlSettingsReader {
  abstract current(): Promise<QualityControlSettings | null>;
}
