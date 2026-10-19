import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { BundleGroup } from "../value-objects/bundle-composition.js";

/**
 * **Les faits des formules** — un par geste (`bundle.*` de
 * `@lfd/contracts/journal-facts`, lot F2a). Le sujet est la formule par sa
 * clé — elle ne se réemploie jamais ; `name` est son nom du moment.
 */
abstract class BundleFact implements JournaledEvent {
  protected constructor(
    readonly bundle: BundleSubject,
    private readonly type: JournalFact["type"],
    private readonly details: Readonly<Record<string, unknown>>,
  ) {}

  journalFact(): JournalFact {
    return {
      type: this.type,
      subjectType: "bundle",
      subjectId: this.bundle.key,
      payload: { subjectLabel: this.bundle.name, ...this.details },
    };
  }
}

export interface BundleSubject {
  readonly key: string;
  readonly name: string;
}

/** Un groupe tel que le journal l'écrit — des tableaux neufs, pas des vues gelées. */
export function journalGroups(groups: readonly BundleGroup[]) {
  return groups.map((group) => ({
    key: group.key,
    label: group.label,
    choices: [...group.choices],
  }));
}

/** Créée en brouillon : tout ce qu'elle dit à sa naissance. */
export class BundleCreatedEvent extends BundleFact {
  constructor(
    bundle: BundleSubject,
    created: {
      readonly description: string | null;
      readonly audience: string;
      readonly groups: readonly BundleGroup[];
    },
  ) {
    super(bundle, "bundle.created", {
      name: bundle.name,
      description: created.description,
      audience: created.audience,
      groups: journalGroups(created.groups),
    });
  }
}

/** Nom ou description : le diff seul. */
export class BundlePresentationEditedEvent extends BundleFact {
  constructor(bundle: BundleSubject, changes: Readonly<Record<string, unknown>>) {
    super(bundle, "bundle.presentation_edited", { changes });
  }
}

/** La composition entière, avant → après. */
export class BundleCompositionSavedEvent extends BundleFact {
  constructor(bundle: BundleSubject, from: readonly BundleGroup[], to: readonly BundleGroup[]) {
    super(bundle, "bundle.composition_saved", {
      groups: { from: journalGroups(from), to: journalGroups(to) },
    });
  }
}

export class BundleWithdrawnEvent extends BundleFact {
  constructor(bundle: BundleSubject) {
    super(bundle, "bundle.withdrawn", {});
  }
}

export class BundleReturnedToDraftEvent extends BundleFact {
  constructor(bundle: BundleSubject) {
    super(bundle, "bundle.returned_to_draft", {});
  }
}
