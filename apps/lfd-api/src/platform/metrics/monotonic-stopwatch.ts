import { Injectable } from "@nestjs/common";

import { Stopwatch } from "./stopwatch.js";

/**
 * Le chronomètre de production, sur l'horloge **monotone** du processus.
 *
 * `performance.now()` et non l'heure du mur : une resynchronisation NTP en
 * cours de mesure rendrait une durée négative ou gonflée. Rien de ce qu'il lit
 * n'est un instant — `lint:clock-port` vise les instants, et celui-ci n'en
 * produit aucun.
 */
@Injectable()
export class MonotonicStopwatch extends Stopwatch {
  start(): () => number {
    const startedAt = performance.now();
    return () => performance.now() - startedAt;
  }
}
