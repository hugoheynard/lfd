import { instantToLocal } from "@lfd/contracts";

import type { Clock } from "../../platform/time/clock.js";

/**
 * Le jour civil de Paris, `AAAA-MM-JJ` — la borne d'une prise de vue.
 *
 * Paris et pas UTC : à 0 h 30 le 11, une photo prise « aujourd'hui » est du
 * 11, alors que l'horloge UTC dit encore le 10 (`lint:business-day`).
 */
export function parisToday(clock: Clock): string {
  return instantToLocal(clock.now()).day;
}
