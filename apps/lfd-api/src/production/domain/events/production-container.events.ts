import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { ContainerRule } from "../services/production-worksheet.js";

/**
 * **Les faits du réglage des contenants** (plan
 * `documentation/journalisation/plan-journal-d-activite.md`, lot 1, tranche (d),
 * 2026-09-19).
 *
 * Le contenant d'un SKU décide ce que la fiche d'atelier annonce au four
 * (« 4 tourneuses »). La ligne ne garde que le dernier réglage et son auteur, et
 * disparaît au retrait : le journal est la seule mémoire de ce qu'il valait, et
 * de qui l'a changé.
 */
export const PRODUCTION_CONTAINER_FACTS = {
  set: "production_container.set",
  removed: "production_container.removed",
} as const;

/** Le sujet : le réglage d'un article, désigné par son SKU — sa clé en base. */
const SUBJECT_TYPE = "production_container";

/** Un réglage tel que le journal le relit — la forme du contrat HTTP. */
function ruleOf(rule: ContainerRule): Record<string, unknown> {
  return {
    unitsPerContainer: rule.unitsPerContainer,
    singular: rule.singular,
    plural: rule.plural,
  };
}

/** Deux réglages disent-ils la même chose ? Un réglage reposé à l'identique n'est pas un fait. */
export function sameContainerRule(a: ContainerRule | null, b: ContainerRule): boolean {
  return (
    a !== null &&
    a.unitsPerContainer === b.unitsPerContainer &&
    a.singular === b.singular &&
    a.plural === b.plural
  );
}

/** Fait : **le contenant est posé ou remplacé**. `before` est `null` sur une première pose. */
export class ProductionContainerSetEvent implements JournaledEvent {
  constructor(
    readonly sku: string,
    readonly before: ContainerRule | null,
    readonly after: ContainerRule,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PRODUCTION_CONTAINER_FACTS.set,
      subjectType: SUBJECT_TYPE,
      subjectId: this.sku,
      payload: {
        before: this.before === null ? null : ruleOf(this.before),
        after: ruleOf(this.after),
      },
    };
  }
}

/** Fait : **le contenant est retiré** — `before` dit ce qu'il valait. */
export class ProductionContainerRemovedEvent implements JournaledEvent {
  constructor(
    readonly sku: string,
    readonly before: ContainerRule,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PRODUCTION_CONTAINER_FACTS.removed,
      subjectType: SUBJECT_TYPE,
      subjectId: this.sku,
      payload: { before: ruleOf(this.before) },
    };
  }
}
