import type { OrderOpening } from "../order-opening.js";

/** Port d'**écriture** du réglage d'ouverture : une ligne, remplacée à chaque geste. */
export abstract class OrderOpeningRepository {
  abstract put(settings: OrderOpening): Promise<void>;
}
