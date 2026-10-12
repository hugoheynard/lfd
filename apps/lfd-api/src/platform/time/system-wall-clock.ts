import { Injectable } from "@nestjs/common";

import { WallClock } from "./wall-clock.js";

/**
 * Adaptateur de production de {@link WallClock} : l'heure système, à chaque
 * appel, contexte de requête ou non. Dérogation déclarée de
 * `lint:clock-port`, avec sa raison.
 */
@Injectable()
export class SystemWallClock extends WallClock {
  elapsedNow(): Date {
    return new Date();
  }
}
