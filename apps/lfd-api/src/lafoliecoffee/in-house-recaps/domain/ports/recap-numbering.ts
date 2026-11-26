import type { RecapMonth } from "../value-objects/recap-month.js";

/**
 * Le numéro d'un récapitulatif, `RBL-AAAAMM-NNNN` : le rang dans son mois,
 * sans trou, pris dans la transaction de l'émission.
 */
export abstract class RecapNumbering {
  abstract next(month: RecapMonth): Promise<string>;
}
