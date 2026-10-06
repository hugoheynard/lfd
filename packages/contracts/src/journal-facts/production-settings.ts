import { z } from "zod";

import { clockTime, day, fact, payload, subjectLabel } from "./fact.js";

/**
 * **Les réglages du fournil** (plan `documentation/production/arret-du-plan.md`,
 * lot A1, 2026-10-06) — l'arrêt du plan automatique ou manuel, et les jours
 * fermés.
 *
 * Le réglage d'arrêt est unique : son sujet n'a pas d'autre nom que son type,
 * d'où l'absence de `subjectLabel`. Un jour fermé se nomme par sa date.
 */
const closeSettings = () =>
  payload({
    mode: z.enum(["auto", "manual"]),
    closeAt: clockTime().nullable(),
    alertAt: clockTime().nullable(),
  });

const closedDay = () => payload({ subjectLabel: subjectLabel(), serviceDay: day() });

export const PRODUCTION_SETTINGS_FACTS = {
  /** Le mode ou une heure a changé. `before` est le réglage en vigueur, défaut compris. */
  "production_settings.close_changed": fact(
    payload({ before: closeSettings(), after: closeSettings() }),
  ),
  /** Un jour où le fournil ne produit pas. */
  "production_closed_day.added": fact(closedDay()),
  /** Ce jour redevient un jour de production. */
  "production_closed_day.removed": fact(closedDay()),
} as const;
