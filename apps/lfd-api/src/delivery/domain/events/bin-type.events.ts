import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { BinType, BinTypeSpec } from "../entities/bin-type.js";

/**
 * **Les faits des bacs** (lot 4 bis, tranche A). Les préfixes
 * `delivery_bin_type.` et `delivery_bin_capacity.` sont rangés sous `commandes`
 * dans `activity-module.ts`, avec le reste de la livraison. Le sujet est
 * toujours le TYPE de bac : une contenance est une case de sa grille.
 */
export const BIN_TYPE_FACTS = {
  added: "delivery_bin_type.added",
  corrected: "delivery_bin_type.corrected",
  archived: "delivery_bin_type.archived",
  reactivated: "delivery_bin_type.reactivated",
  capacitySet: "delivery_bin_capacity.set",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "delivery_bin_type";

/** Une fiche au journal, telle que le contrat la décrit (`BinTypeSpec`). */
function journaledSpec(spec: BinTypeSpec): Readonly<Record<string, unknown>> {
  return {
    name: spec.name,
    outer: spec.outer,
    inner: spec.inner,
    isotherm: spec.isotherm,
    maxStack: spec.maxStack,
    divisible: spec.divisible,
  };
}

/** Un geste nommé sur un type : entré, archivé, réactivé. */
abstract class BinTypeGestureEvent implements JournaledEvent {
  constructor(readonly binType: BinType) {}

  protected abstract readonly type: JournalFactType;

  journalFact(): JournalFact {
    return {
      type: this.type,
      subjectType: SUBJECT_TYPE,
      subjectId: this.binType.id,
      payload: {
        subjectLabel: this.binType.name,
        bin: journaledSpec(this.binType.specification),
      },
    };
  }
}

export class BinTypeAddedEvent extends BinTypeGestureEvent {
  protected readonly type = BIN_TYPE_FACTS.added;
}

export class BinTypeArchivedEvent extends BinTypeGestureEvent {
  protected readonly type = BIN_TYPE_FACTS.archived;
}

export class BinTypeReactivatedEvent extends BinTypeGestureEvent {
  protected readonly type = BIN_TYPE_FACTS.reactivated;
}

/** La charge dit l'avant ET l'après. */
export class BinTypeCorrectedEvent implements JournaledEvent {
  constructor(
    readonly binType: BinType,
    readonly before: BinTypeSpec,
  ) {}

  journalFact(): JournalFact {
    return {
      type: BIN_TYPE_FACTS.corrected,
      subjectType: SUBJECT_TYPE,
      subjectId: this.binType.id,
      payload: {
        subjectLabel: this.binType.name,
        before: journaledSpec(this.before),
        after: journaledSpec(this.binType.specification),
      },
    };
  }
}

/** Une contenance posée, changée ou retirée : `null` = aucune. */
export class BinCapacitySetEvent implements JournaledEvent {
  constructor(
    readonly binType: BinType,
    readonly sku: string,
    readonly before: number | null,
    readonly after: number | null,
  ) {}

  journalFact(): JournalFact {
    return {
      type: BIN_TYPE_FACTS.capacitySet,
      subjectType: SUBJECT_TYPE,
      subjectId: this.binType.id,
      payload: {
        subjectLabel: this.binType.name,
        sku: this.sku,
        before: this.before,
        after: this.after,
      },
    };
  }
}
