import { addDays, instantToLocal } from "@lfd/contracts";

import type { LocalNow } from "../domain/services/rounds-gap.js";

/** L'instant du `Clock`, dit à l'heure de Paris : aujourd'hui, demain, l'heure. */
export function localNowOf(instant: Date): LocalNow {
  const local = instantToLocal(instant);
  return { today: local.day, tomorrow: addDays(local.day, 1), time: local.time };
}
