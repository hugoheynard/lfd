import type { GesturePositionFields } from "@lfd/contracts";

import type { DeliveryRound } from "../domain/entities/delivery-round.js";
import { DoorstepRoundStaleError } from "../domain/errors/delivery-doorstep-errors.js";
import { DeliveryRoundStaleError } from "../domain/errors/delivery-round-errors.js";
import { GesturePositionInvalidError } from "../domain/errors/gesture-position-errors.js";
import { GesturePosition } from "../domain/value-objects/gesture-position.js";

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

/**
 * La position du téléphone au geste (YA-D4), ou `null` quand l'écran n'en a
 * pas envoyé — refus du navigateur, pas de signal. Le contrat a vérifié que
 * les trois champs vont ensemble ; le domaine revérifie les bornes.
 *
 * @throws {GesturePositionInvalidError}
 */
export function gesturePositionOf(fields: GesturePositionFields): GesturePosition | null {
  const { positionLat, positionLng, positionAccuracyM } = fields;
  if (positionLat === undefined && positionLng === undefined && positionAccuracyM === undefined) {
    return null;
  }
  if (positionLat === undefined || positionLng === undefined || positionAccuracyM === undefined) {
    throw new GesturePositionInvalidError();
  }
  return GesturePosition.take({ lat: positionLat, lng: positionLng, accuracyM: positionAccuracyM });
}
