import type { DepartureChoice } from "../entities/departure-choice.js";

/** Port d'**écriture** du départ : une ligne, remplacée à chaque choix. */
export abstract class DepartureRepository {
  abstract put(choice: DepartureChoice): Promise<void>;
}
