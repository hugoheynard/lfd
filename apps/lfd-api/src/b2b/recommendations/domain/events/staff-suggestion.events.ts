import type { StaffSuggestionOrder } from "@lfd/contracts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { StaffSuggestionRuleSnapshot } from "../entities/staff-suggestion-rule.js";

/**
 * **Les faits des suggestions décidées** — un par geste
 * (`staff_suggestion.*` de `@lfd/contracts/journal-facts`, RS1 du plan
 * `documentation/recommandation-produit/plan-suggestions-du-staff.md`).
 *
 * Le sujet est la règle par son id ; `subjectLabel` sa phrase française du
 * moment, sinon les articles qu'elle montre. Les charges disent les jours en
 * TEXTE (`AAAA-MM-JJ`) : un diff entre deux `Date` s'y vaudrait toujours.
 */

/** Ce que le journal dit d'une règle : toutes ses valeurs, en texte. */
export function journalRule(rule: StaffSuggestionRuleSnapshot): Readonly<Record<string, unknown>> {
  return {
    trigger: rule.trigger.kind,
    triggerRef: rule.trigger.ref,
    skus: [...rule.suggestedSkus],
    placement: rule.placement,
    audience: rule.audience,
    startsOn: rule.period.startsOn,
    endsOn: rule.period.endsOn,
    phrase: rule.phrase === null ? null : { ...rule.phrase },
    priority: rule.priority,
  };
}

/** Le nom d'une règle au journal : sa phrase, sinon ce qu'elle montre. */
export function ruleLabel(rule: StaffSuggestionRuleSnapshot): string {
  return rule.phrase?.fr ?? `Conseil : ${rule.suggestedSkus.join(", ")}`;
}

abstract class SuggestionRuleFact implements JournaledEvent {
  protected constructor(
    readonly rule: StaffSuggestionRuleSnapshot,
    private readonly type: JournalFact["type"],
    private readonly details: Readonly<Record<string, unknown>>,
  ) {}

  journalFact(): JournalFact {
    return {
      type: this.type,
      subjectType: "staff_suggestion",
      subjectId: this.rule.id,
      payload: { subjectLabel: ruleLabel(this.rule), ...this.details },
    };
  }
}

/** Créée : tout ce qu'elle dit à sa naissance. */
export class StaffSuggestionCreatedEvent extends SuggestionRuleFact {
  constructor(rule: StaffSuggestionRuleSnapshot) {
    super(rule, "staff_suggestion.created", journalRule(rule));
  }
}

/** Réécrite : le diff seul, calculé par le cas d'usage. */
export class StaffSuggestionRevisedEvent extends SuggestionRuleFact {
  constructor(rule: StaffSuggestionRuleSnapshot, changes: Readonly<Record<string, unknown>>) {
    super(rule, "staff_suggestion.revised", { changes });
  }
}

/** Rallumée (`active: true`) ou coupée — deux faits, deux mots au journal. */
export class StaffSuggestionActivityChangedEvent extends SuggestionRuleFact {
  constructor(rule: StaffSuggestionRuleSnapshot) {
    super(rule, rule.active ? "staff_suggestion.activated" : "staff_suggestion.deactivated", {});
  }
}

export class StaffSuggestionArchivedEvent extends SuggestionRuleFact {
  constructor(rule: StaffSuggestionRuleSnapshot) {
    super(rule, "staff_suggestion.archived", {});
  }
}

/** L'ordre entre règles concurrentes, avant → après (Q3). Un seul réglage, un seul sujet. */
export class StaffSuggestionOrderChangedEvent implements JournaledEvent {
  constructor(
    readonly from: StaffSuggestionOrder,
    readonly to: StaffSuggestionOrder,
  ) {}

  journalFact(): JournalFact {
    return {
      type: "staff_suggestion_order.changed",
      subjectType: "staff_suggestion_order",
      subjectId: "suggestions",
      payload: { order: { from: this.from, to: this.to } },
    };
  }
}
