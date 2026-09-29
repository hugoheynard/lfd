import type { GeocodeAnswer } from "./geocoder.js";

/**
 * Port d'**écriture** du cache du géocodage (L7-C10). 🔴 L'adaptateur ne garde
 * de la clé que son EMPREINTE : aucune adresse en clair ne s'écrit.
 */
export abstract class GeocodeCacheRepository {
  /** Pose (ou rejoue) ces points ; une réponse sans point n'est pas écrite. */
  abstract put(answers: readonly GeocodeAnswer[], at: Date): Promise<void>;
}
