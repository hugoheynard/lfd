import type {
  StaffSuggestionPreviewItem,
  StaffSuggestionPreviewRule,
  StaffSuggestionPreviewView,
} from "@lfd/contracts";

import type {
  RuleDiagnosis,
  SuggestionVerdict,
} from "../../domain/services/suggestion-diagnosis.js";
import type { ShowcaseDiagnosis } from "../services/staff-suggestion-showcase.js";

/** L'aperçu tel que l'écran le lit : un statut fermé, et la règle gagnante à part. */
export function staffSuggestionPreviewView(
  day: string,
  time: string,
  diagnosis: ShowcaseDiagnosis,
): StaffSuggestionPreviewView {
  return { day, time, shown: diagnosis.shown, rules: diagnosis.rules.map(ruleView) };
}

function ruleView(diagnosis: RuleDiagnosis): StaffSuggestionPreviewRule {
  return {
    ruleId: diagnosis.rule.id,
    ...statusOf(diagnosis.verdict),
    items: diagnosis.items.map(({ sku, verdict }): StaffSuggestionPreviewItem => ({
      sku,
      ...statusOf(verdict),
    })),
  };
}

function statusOf(
  verdict: SuggestionVerdict,
): Pick<StaffSuggestionPreviewItem, "status" | "outrankedBy"> {
  return verdict.kind === "outranked_by"
    ? { status: "outranked_by", outrankedBy: verdict.ruleId }
    : { status: verdict.kind, outrankedBy: null };
}
