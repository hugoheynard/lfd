import type { CustomerCancellationSettings } from "../customer-cancellation-settings.js";

/** Port d'**écriture** du réglage d'annulation par le client : une ligne, remplacée à chaque geste. */
export abstract class CustomerCancellationSettingsRepository {
  abstract put(settings: CustomerCancellationSettings): Promise<void>;
}
