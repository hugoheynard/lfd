import type { AllergenDisplaySetting } from "./allergen-display.js";

/**
 * Port de **lecture** des réglages globaux de la vitrine — l'éditeur et la
 * page publique le lisent ; ni l'un ni l'autre n'écrit (ISP).
 */
export abstract class StorefrontSettingsReader {
  /** Jamais réglé : le défaut, `updatedAt` à `null`. */
  abstract allergenDisplay(): Promise<AllergenDisplaySetting>;
}
