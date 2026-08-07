import { Injectable } from "@nestjs/common";

import type { Instant } from "../context/request-context.js";
import { currentRequestContext } from "../context/request-context.store.js";
import { Clock } from "./clock.js";

/**
 * Adaptateur de production du port `Clock`.
 *
 * Dans une requête, rend l'instant **gelé à l'ingress** (le `now` du
 * `RequestContext`) → deux lectures dans un même handler renvoient le même
 * instant, jamais de dérive de quelques ms entre deux événements. Hors requête
 * (cron de recompute, boot), il n'y a pas de contexte : on lit l'heure système.
 *
 * C'est **le seul endroit** du backend autorisé à appeler `new Date()` — partout
 * ailleurs, on injecte `Clock`.
 */
@Injectable()
export class SystemClock extends Clock {
  now(): Instant {
    const context = currentRequestContext();
    if (context !== null) {
      return context.now;
    }
    return new Date();
  }
}
