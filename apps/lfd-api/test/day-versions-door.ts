import type { DayJournal, VersionsView } from "@lfd/contracts";
import type request from "supertest";

import { jsonBody } from "./e2e-harness.js";

/**
 * **La porte des versions**, vue des e2e pour les sujets journaliers
 * (`documentation/caching-usage/le-cache-du-back-office.md`, § 2.3) : chaque
 * suite lit ici.
 */
export const DAY_VERSIONS = "/admin/versions";

/** Les versions permises à cet agent, pour ces journaux et ce jour. */
export async function dayVersionsOf(
  agent: request.Agent,
  day: string,
  journals: readonly DayJournal[],
): Promise<VersionsView> {
  const response = await agent
    .get(`${DAY_VERSIONS}?date=${day}&subjects=${journals.join(",")}`)
    .expect(200);
  const view = jsonBody<VersionsView>(response);
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
