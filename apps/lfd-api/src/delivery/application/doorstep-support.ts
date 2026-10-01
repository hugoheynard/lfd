import type { DeliveryRound } from "../domain/entities/delivery-round.js";
import { DoorstepRoundStaleError } from "../domain/errors/delivery-doorstep-errors.js";
import { DeliveryRoundStaleError } from "../domain/errors/delivery-round-errors.js";

/**
 * La version lue par l'écran du livreur ; le refus du domaine, redit pour lui
 * — les gestes qui clôturent un arrêt (sans remise, remis) la présentent.
 *
 * @throws {DoorstepRoundStaleError}
 */
export function ensureFreshForDriver(round: DeliveryRound, version: number): void {
  try {
    round.ensureVersion(version);
  } catch (error) {
    throw error instanceof DeliveryRoundStaleError ? new DoorstepRoundStaleError() : error;
  }
}
