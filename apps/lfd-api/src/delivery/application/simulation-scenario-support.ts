import type { SimulationScenario } from "../domain/entities/simulation-scenario.js";
import {
  SimulationScenarioNameTakenError,
  SimulationScenarioNotFoundError,
} from "../domain/errors/delivery-simulation-errors.js";
import type { SimulationScenarioRepository } from "../domain/ports/simulation-scenario.repository.js";
import { copyNameCandidates } from "../domain/services/simulation-scenario-copy-name.js";

/**
 * Les gardes que plusieurs cas des scénarios partagent (L9-C7).
 */

/** Un scénario VIVANT — un archivé ne se remplace ni ne se duplique. @throws {SimulationScenarioNotFoundError} */
export async function loadLiveScenario(
  scenarios: SimulationScenarioRepository,
  id: string,
): Promise<SimulationScenario> {
  const scenario = await scenarios.load(id);
  if (scenario === null || scenario.archived) {
    throw new SimulationScenarioNotFoundError(id);
  }
  return scenario;
}

/**
 * Refuse un nom déjà porté par un autre scénario non archivé — lu avant
 * d'écrire, l'index partiel tenant la course.
 *
 * @throws {SimulationScenarioNameTakenError}
 */
export async function ensureScenarioNameFree(
  scenarios: SimulationScenarioRepository,
  scenario: SimulationScenario,
): Promise<void> {
  if (await scenarios.nameTaken(scenario.name, scenario.id)) {
    throw new SimulationScenarioNameTakenError(scenario.name);
  }
}

/** Le premier nom de copie libre. @throws {SimulationScenarioNameTakenError} tous sont pris. */
export async function freeCopyName(
  scenarios: SimulationScenarioRepository,
  source: string,
): Promise<string> {
  const candidates = copyNameCandidates(source);
  for (const candidate of candidates) {
    if (!(await scenarios.nameTaken(candidate, null))) {
      return candidate;
    }
  }
  throw new SimulationScenarioNameTakenError(candidates.at(-1) ?? source);
}
