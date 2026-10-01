import type { PurchaseScenario } from "../domain/entities/purchase-scenario.js";
import {
  PurchaseScenarioNameTakenError,
  PurchaseScenarioNotFoundError,
} from "../domain/errors/delivery-purchase-scenario-errors.js";
import type { PurchaseScenarioRepository } from "../domain/ports/purchase-scenario.repository.js";

/** Les gardes que plusieurs cas des scénarios d'achat partagent (B-D5). */

/** @throws {PurchaseScenarioNotFoundError} */
export async function loadPurchaseScenario(
  scenarios: PurchaseScenarioRepository,
  id: string,
): Promise<PurchaseScenario> {
  const scenario = await scenarios.load(id);
  if (scenario === null) {
    throw new PurchaseScenarioNotFoundError(id);
  }
  return scenario;
}

/**
 * Refuse d'écrire un scénario NON archivé dont le nom est porté par un autre
 * non archivé — lu avant d'écrire, l'index partiel tenant la course. Un
 * archivé ne compte pas : l'index ne le voit pas non plus.
 *
 * @throws {PurchaseScenarioNameTakenError}
 */
export async function ensurePurchaseScenarioNameFree(
  scenarios: PurchaseScenarioRepository,
  scenario: PurchaseScenario,
): Promise<void> {
  if (!scenario.archived && (await scenarios.activeNameTaken(scenario.name, scenario.id))) {
    throw new PurchaseScenarioNameTakenError(scenario.name);
  }
}
