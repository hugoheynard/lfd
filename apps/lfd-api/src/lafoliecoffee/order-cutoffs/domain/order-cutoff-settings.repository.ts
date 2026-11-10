import type { OrderCutoffSettings } from "./order-cutoff-settings.js";

/** Port d'**écriture** de l'interrupteur : une ligne, remplacée à chaque geste. */
export abstract class OrderCutoffSettingsRepository {
  abstract put(settings: OrderCutoffSettings): Promise<void>;
}
