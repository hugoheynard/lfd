import { purchaseScenarioContentSchema } from "@lfd/contracts";

import type { PurchaseScenarioStoredContent } from "../domain/entities/purchase-scenario.js";
import { BIN_GAP_MAX_CM, BIN_GAP_MIN_CM } from "../domain/value-objects/bin-gap.js";

/**
 * **Relire un scénario d'achat, c'est le revalider** (B-D5) : le `jsonb`
 * repasse par le schéma de la sélection du tableau, puis par la borne du jeu
 * que le domaine tient. Un contenu devenu invalide n'est pas une panne : il
 * devient illisible, et se refuse en le nommant — jamais une 500.
 */
export function purchaseScenarioContentOf(raw: unknown): PurchaseScenarioStoredContent {
  const parsed = purchaseScenarioContentSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where =
      issue === undefined || issue.path.length === 0 ? "" : `${issue.path.join(".")} : `;
    return { readable: false, reason: `${where}${issue?.message ?? "contenu inattendu"}` };
  }
  const { gapCm } = parsed.data.selection;
  if (gapCm < BIN_GAP_MIN_CM || gapCm > BIN_GAP_MAX_CM) {
    return {
      readable: false,
      reason: `jeu de ${gapCm} cm hors de ${BIN_GAP_MIN_CM} à ${BIN_GAP_MAX_CM} cm`,
    };
  }
  return { readable: true, content: parsed.data };
}

/** Le nombre d'éléments d'une liste de la sélection brute — zéro si elle n'en est pas une. */
export function rawSelectionCountOf(raw: unknown, key: "vehicles" | "formats"): number {
  if (typeof raw !== "object" || raw === null) {
    return 0;
  }
  const selection: unknown = Reflect.get(raw, "selection");
  if (typeof selection !== "object" || selection === null) {
    return 0;
  }
  const value: unknown = Reflect.get(selection, key);
  return Array.isArray(value) ? value.length : 0;
}
