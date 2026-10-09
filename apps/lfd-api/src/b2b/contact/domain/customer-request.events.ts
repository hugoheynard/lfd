import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { CustomerRequest } from "./customer-request.js";

/**
 * **Les faits des demandes clients.** Le préfixe `customer_request.` est
 * rangé sous `commercial` dans `activity-module.ts`.
 */
export const CUSTOMER_REQUEST_FACTS = {
  handled: "customer_request.handled",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * Une demande vient d'être rangée — photos comprises. **Pas journalisé** : ce
 * n'est pas un acte du staff, et la charge porterait des données
 * personnelles qui s'anonymisent. Ses abonnés envoient le courriel à
 * l'adresse du motif et font sonner la cloche ; un échec de l'un ne défait
 * pas la demande.
 */
export class CustomerRequestReceivedEvent {
  constructor(
    readonly request: CustomerRequest,
    readonly recipientEmail: string,
  ) {}
}

/** Le staff a traité une demande. Le sujet est la demande, nommée par son motif. */
export class CustomerRequestHandledEvent implements JournaledEvent {
  constructor(readonly request: CustomerRequest) {}

  journalFact(): JournalFact {
    return {
      type: CUSTOMER_REQUEST_FACTS.handled,
      subjectType: "customer_request",
      subjectId: this.request.id,
      payload: { subjectLabel: this.request.reasonLabel, kind: this.request.kind },
    };
  }
}
