import type { DayJournal, DayVersionsView } from "@lfd/contracts";
import type request from "supertest";

import { jsonBody } from "./e2e-harness.js";

/**
 * **La porte unique des versions de journée**, vue des e2e
 * (`documentation/caching-usage/plan-version-par-journee.md`, D8, 2026-11-03).
 * Les six routes par journal sont retirées : chaque suite lit ici.
 */
export const DAY_VERSIONS = "/admin/day-versions";

/** Les versions permises à cet agent, pour ces journaux et ce jour. */
export async function dayVersionsOf(
  agent: request.Agent,
  day: string,
  journals: readonly DayJournal[],
): Promise<DayVersionsView> {
  const response = await agent
    .get(`${DAY_VERSIONS}?date=${day}&journals=${journals.join(",")}`)
    .expect(200);
  const view = jsonBody<DayVersionsView>(response);
  expect(view.date).toBe(day);
  return view;
}

/**
 * La version d'UN journal. Échoue si la porte l'omet : la suite qui l'appelle
 * suppose le droit, et un journal absent lu comme `0` cacherait un droit perdu.
 */
export async function dayVersionOf(
  agent: request.Agent,
  journal: DayJournal,
  day: string,
): Promise<number> {
  const version = (await dayVersionsOf(agent, day, [journal])).versions[journal];
  expect({ journal, permitted: version !== undefined }).toEqual({ journal, permitted: true });
  return version ?? 0;
}
