import { deliverySimulationPayloadSchema } from "@lfd/contracts";

import type { SimulationScenarioContent } from "../domain/entities/simulation-scenario.js";

/**
 * **Relire un scénario, c'est le revalider** (L9-C7) : le `jsonb` repasse par
 * le schéma du simulateur. Un contenu devenu invalide (une borne resserrée
 * depuis) n'est pas une panne : il devient un contenu illisible, qui se refuse
 * en le nommant — jamais une 500.
 */
export function scenarioContentOf(raw: unknown): SimulationScenarioContent {
  const parsed = deliverySimulationPayloadSchema.safeParse(raw);
  if (parsed.success) {
    return { readable: true, payload: parsed.data };
  }
  const issue = parsed.error.issues[0];
  const where = issue === undefined || issue.path.length === 0 ? "" : `${issue.path.join(".")} : `;
  return { readable: false, reason: `${where}${issue?.message ?? "contenu inattendu"}` };
}

/** Le nombre d'éléments d'un tableau du contenu brut — zéro s'il n'en est pas un. */
export function rawCountOf(raw: unknown, key: "stops" | "vehicles"): number {
  if (typeof raw !== "object" || raw === null) {
    return 0;
  }
  const value: unknown = Reflect.get(raw, key);
  return Array.isArray(value) ? value.length : 0;
}
