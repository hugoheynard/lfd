import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { CustomerRequest } from "./customer-request.js";
import type { ReportedOrderRef } from "./customer-request-details.js";
import type { AppliedOrderChange } from "./ports/order-change.applier.js";

/**
 * **Les faits de la demande de modification** (plan
 * `documentation/commandes/plan-modifier-une-commande.md`, M4). Le sujet est
 * la COMMANDE, nommée par son numéro ; la demande y est citée par son id.
 * Rien de l'auteur : la demande s'anonymise, le journal non.
 */
export const ORDER_CHANGE_FACTS = {
  requested: "order.change_requested",
  applied: "order.change_applied",
  refused: "order.change_refused",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Ce que les trois faits ont en commun : la commande, la demande, la révision de départ. */
interface ChangeSubject {
  readonly requestId: string;
  readonly order: ReportedOrderRef;
  readonly baseRevision: number;
}

function changeFact(
  type: JournalFactType,
  subject: ChangeSubject,
  extra: Record<string, unknown>,
): JournalFact {
  return {
    type,
    subjectType: "order",
    subjectId: subject.order.id,
    payload: {
      subjectLabel: subject.order.number,
      orderId: subject.order.id,
      orderNumber: subject.order.number,
      requestId: subject.requestId,
      baseRevision: subject.baseRevision,
      ...extra,
    },
  };
}

/** Le client a demandé une modification, l'heure limite passée. */
export class OrderChangeRequestedEvent implements JournaledEvent {
  constructor(readonly subject: ChangeSubject) {}

  journalFact(): JournalFact {
    return changeFact(ORDER_CHANGE_FACTS.requested, this.subject, {});
  }
}

/**
 * Le commerce a répondu. `request` est la demande telle qu'elle vient d'être
 * enregistrée : l'abonné du courriel y lit l'adresse de l'auteur et la réponse.
 */
abstract class OrderChangeAnsweredEvent implements JournaledEvent {
  constructor(
    readonly request: CustomerRequest,
    readonly subject: ChangeSubject,
  ) {}

  abstract journalFact(): JournalFact;
}

/**
 * La modification a été appliquée : `applied` est la révision qu'elle a
 * produite, avec ses totaux avant / après — lus sur elle, pas recalculés.
 */
export class OrderChangeAppliedEvent extends OrderChangeAnsweredEvent {
  constructor(
    request: CustomerRequest,
    subject: ChangeSubject,
    readonly applied: AppliedOrderChange,
  ) {
    super(request, subject);
  }

  journalFact(): JournalFact {
    return changeFact(ORDER_CHANGE_FACTS.applied, this.subject, {
      revision: this.applied.revision,
    });
  }
}

/** La modification a été refusée ; `reason` est le mot adressé au client. */
export class OrderChangeRefusedEvent extends OrderChangeAnsweredEvent {
  constructor(
    request: CustomerRequest,
    subject: ChangeSubject,
    readonly reason: string,
  ) {
    super(request, subject);
  }

  journalFact(): JournalFact {
    return changeFact(ORDER_CHANGE_FACTS.refused, this.subject, { reason: this.reason });
  }
}
