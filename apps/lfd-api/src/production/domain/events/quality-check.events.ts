import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { QualityCheck } from "../entities/quality-check.js";

/**
 * **Les faits du contrôle qualité** (plan
 * `documentation/production/plan-controle-qualite.md`, D9).
 *
 * Écrits dans la transaction du verdict par `publishTraced` : un journal en
 * panne annule le verdict, comme `production_day.closed`. Le sujet est le
 * CONTRÔLE — une ligne jamais réécrite —, son libellé la cible telle que le
 * fournil la nomme (SKU d'une ligne, référence d'une commande).
 *
 * ⚠️ Ni la note ni les photos : elles ne se lisent qu'en
 * `b2b_supervision:write` (D3), et le journal a d'autres lecteurs. L'auteur
 * n'est pas dans la charge : c'est l'acteur de la ligne, résolu par le journal.
 */
export const PRODUCTION_QUALITY_FACTS = {
  checked: "production_quality.checked",
  holdRaised: "production_quality.hold_raised",
  holdLifted: "production_quality.hold_lifted",
} as const satisfies Readonly<Record<string, JournalFactType>>;

const SUBJECT_TYPE = "production_quality_check";

/** Le contrôle, et le nom de sa cible — le SKU d'une ligne, la référence d'une commande. */
export interface LabelledQualityCheck {
  readonly check: QualityCheck;
  readonly label: string;
}

function basePayload({ check, label }: LabelledQualityCheck): Record<string, unknown> {
  const target =
    check.target.kind === "line"
      ? { kind: "line", sku: check.target.sku, quantitySeen: check.target.quantitySeen }
      : { kind: "order", order: { id: check.target.orderId, name: label } };
  return { subjectLabel: label, serviceDay: check.serviceDay.value, target };
}

function factOf(
  type: JournalFactType,
  subject: LabelledQualityCheck,
  extra: Record<string, unknown>,
): JournalFact {
  return {
    type,
    subjectType: SUBJECT_TYPE,
    subjectId: subject.check.id,
    payload: { ...basePayload(subject), ...extra },
  };
}

/** Fait : **un verdict est rendu** — OK, réserve ou bloquant. */
export class QualityCheckedJournalEvent implements JournaledEvent {
  constructor(readonly subject: LabelledQualityCheck) {}

  journalFact(): JournalFact {
    const { check } = this.subject;
    return factOf(PRODUCTION_QUALITY_FACTS.checked, this.subject, {
      verdict: check.verdict,
      photoCount: check.photos.length,
    });
  }
}

/** Une commande retenue, sous sa référence du moment (`ORD-…`). */
export interface HeldOrder {
  readonly id: string;
  readonly reference: string;
}

/** Fait : **la cible devient bloquante** — les commandes retenues à cet instant. */
export class QualityHoldRaisedJournalEvent implements JournaledEvent {
  constructor(
    readonly subject: LabelledQualityCheck,
    readonly heldOrders: readonly HeldOrder[],
  ) {}

  journalFact(): JournalFact {
    return factOf(PRODUCTION_QUALITY_FACTS.holdRaised, this.subject, {
      heldOrders: this.heldOrders.map((order) => ({ id: order.id, name: order.reference })),
    });
  }
}

/** Fait : **un nouveau verdict lève le blocage** de la cible. */
export class QualityHoldLiftedJournalEvent implements JournaledEvent {
  constructor(readonly subject: LabelledQualityCheck) {}

  journalFact(): JournalFact {
    return factOf(PRODUCTION_QUALITY_FACTS.holdLifted, this.subject, {
      verdict: this.subject.check.verdict,
    });
  }
}
