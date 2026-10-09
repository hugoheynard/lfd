import type { ContactSettings } from "../contact-settings.js";

/** Port d'**écriture** de la carte de contact : une ligne, remplacée à chaque geste. */
export abstract class ContactSettingsRepository {
  abstract put(settings: ContactSettings): Promise<void>;
}
