import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";

/**
 * **Les faits des opérations tenues au commerce** — un par geste
 * (`catalog_operation.*` de `@lfd/contracts/journal-facts`, O6 du plan
 * `documentation/operations-datees/plan-l-operation-passe-au-commerce.md`).
 *
 * Le sujet est l'opération par sa clé, comme pour la surcharge
 * (`catalog_operation`) : une clé ne se réemploie pas, donc l'historique d'une
 * clé est celui d'une seule opération. `name` est son nom français du moment.
 *
 * Les charges sont calculées par le cas d'usage (diffs en TEXTE : une `Date`
 * dans un diff s'y vaudrait toujours, cf. `changesBetween`) ; l'événement ne
 * fait que les nommer.
 */
abstract class OperationFact implements JournaledEvent {
  protected constructor(
    readonly operation: { readonly key: string; readonly name: string },
    private readonly type: JournalFact["type"],
    private readonly details: Readonly<Record<string, unknown>>,
  ) {}

  journalFact(): JournalFact {
    return {
      type: this.type,
      subjectType: "catalog_operation",
      subjectId: this.operation.key,
      payload: { subjectLabel: this.operation.name, ...this.details },
    };
  }
}

type Subject = { readonly key: string; readonly name: string };

/** Préparée : tout ce qu'elle dit à sa naissance. */
export class OperationPreparedEvent extends OperationFact {
  constructor(operation: Subject, prepared: Readonly<Record<string, unknown>>) {
    super(operation, "catalog_operation.prepared", prepared);
  }
}

/** Nom, accroche, image : le diff seul. */
export class OperationEditedEvent extends OperationFact {
  constructor(operation: Subject, changes: Readonly<Record<string, unknown>>) {
    super(operation, "catalog_operation.edited", { changes });
  }
}

/** Les dates qui ont bougé, avant → après. */
export class OperationRescheduledEvent extends OperationFact {
  constructor(operation: Subject, changes: Readonly<Record<string, unknown>>) {
    super(operation, "catalog_operation.rescheduled", { changes });
  }
}

export class OperationAudienceChangedEvent extends OperationFact {
  constructor(operation: Subject, from: string, to: string) {
    super(operation, "catalog_operation.audience_changed", { audience: { from, to } });
  }
}

/** Masquée (`hidden: true`) ou affichée de nouveau — deux faits, deux mots au journal. */
export class OperationVisibilityChangedEvent extends OperationFact {
  constructor(operation: Subject, hidden: boolean) {
    super(operation, hidden ? "catalog_operation.hidden" : "catalog_operation.shown", {});
  }
}

/** La sélection ENTIÈRE, avant → après, dans l'ordre du rayon. */
export class OperationSelectionSavedEvent extends OperationFact {
  constructor(operation: Subject, from: readonly string[], to: readonly string[]) {
    super(operation, "catalog_operation.selection_saved", {
      skus: { from: [...from], to: [...to] },
    });
  }
}

export class OperationArchivedEvent extends OperationFact {
  constructor(operation: Subject) {
    super(operation, "catalog_operation.archived", {});
  }
}
