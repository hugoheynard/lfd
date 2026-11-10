import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { OrderOpeningExemption } from "./order-opening-exemption.js";

/**
 * **Les faits des exemptions à la fermeture** (décision de Hugo du
 * 2026-10-26). Rangés sous `commandes` par le préfixe `order_opening.`
 * (`activity-module.ts`) : « qui a laissé ce client commander pendant la
 * fermeture » se relit au même endroit que la fermeture elle-même.
 */
export const ORDER_OPENING_EXEMPTION_FACTS = {
  granted: "order_opening.exemption_granted",
  withdrawn: "order_opening.exemption_withdrawn",
} as const satisfies Readonly<Record<string, JournalFactType>>;

function exemptionFact(type: JournalFactType, exemption: OrderOpeningExemption): JournalFact {
  const { target } = exemption;
  return {
    type,
    subjectType: "order_opening",
    subjectId: exemption.id,
    payload: {
      subjectLabel: exemption.label,
      kind: target.kind,
      company:
        target.kind === "company" ? { id: target.companyId, name: target.companyName } : null,
    },
  };
}

export class OrderOpeningExemptionGrantedEvent implements JournaledEvent {
  constructor(readonly exemption: OrderOpeningExemption) {}

  journalFact(): JournalFact {
    return exemptionFact(ORDER_OPENING_EXEMPTION_FACTS.granted, this.exemption);
  }
}

export class OrderOpeningExemptionWithdrawnEvent implements JournaledEvent {
  constructor(readonly exemption: OrderOpeningExemption) {}

  journalFact(): JournalFact {
    return exemptionFact(ORDER_OPENING_EXEMPTION_FACTS.withdrawn, this.exemption);
  }
}
