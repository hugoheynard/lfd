import type { DeliveryAuthor } from "../entities/departure-choice.js";
import type { RoutingSettings } from "../value-objects/routing-settings.js";

/** Port d'**écriture** des réglages du calcul : une ligne, remplacée, auteur figé. */
export abstract class RoutingSettingsRepository {
  abstract put(settings: RoutingSettings, at: Date, author: DeliveryAuthor): Promise<void>;
}
