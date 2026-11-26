import type { InHouseRecap } from "../entities/in-house-recap.js";

/** Le récapitulatif relu pour l'écran — le port de lecture, distinct du dépôt. */
export abstract class InHouseRecapReader {
  abstract load(recapId: string): Promise<InHouseRecap | null>;
}
