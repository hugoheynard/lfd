import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { BatchShortcut, BatchShortcutTerms } from "../entities/batch-shortcut.js";

/**
 * **Les faits des raccourcis du fournil** (Réglages › Production, plan
 * `fournil/plan-raccourcis-du-fournil.md`, S1). La ligne ne garde que le
 * dernier état et son créateur ; le journal dit qui l'a modifié ou supprimé,
 * et ce qu'il disait avant.
 */
export const BATCH_SHORTCUT_FACTS = {
  created: "production_batch_shortcut.created",
  updated: "production_batch_shortcut.updated",
  removed: "production_batch_shortcut.removed",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "production_batch_shortcut";

/** « 1 plaque (VIE-001) » : le nom, et le produit qu'il sert. */
function subjectLabelOf(shortcut: BatchShortcut): string {
  return `${shortcut.label} (${shortcut.sku})`;
}

function factOf(
  type: JournalFactType,
  shortcut: BatchShortcut,
  extra: Readonly<Record<string, unknown>> = {},
): JournalFact {
  return {
    type,
    subjectType: SUBJECT_TYPE,
    subjectId: shortcut.id,
    payload: {
      subjectLabel: subjectLabelOf(shortcut),
      sku: shortcut.sku,
      label: shortcut.label,
      pieces: shortcut.pieces,
      ...extra,
    },
  };
}

/** Un raccourci ajouté à un produit. */
export class BatchShortcutCreatedEvent implements JournaledEvent {
  constructor(readonly shortcut: BatchShortcut) {}

  journalFact(): JournalFact {
    return factOf(BATCH_SHORTCUT_FACTS.created, this.shortcut);
  }
}

/** Un raccourci renommé ou recompté : la charge dit l'avant. */
export class BatchShortcutUpdatedEvent implements JournaledEvent {
  constructor(
    readonly shortcut: BatchShortcut,
    readonly previous: BatchShortcutTerms,
  ) {}

  journalFact(): JournalFact {
    return factOf(BATCH_SHORTCUT_FACTS.updated, this.shortcut, {
      previous: { label: this.previous.label, pieces: this.previous.pieces },
    });
  }
}

/** Un raccourci supprimé — archivé. */
export class BatchShortcutRemovedEvent implements JournaledEvent {
  constructor(readonly shortcut: BatchShortcut) {}

  journalFact(): JournalFact {
    return factOf(BATCH_SHORTCUT_FACTS.removed, this.shortcut);
  }
}
