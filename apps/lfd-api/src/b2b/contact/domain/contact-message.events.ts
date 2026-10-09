import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { ContactMessage } from "./contact-message.js";

/**
 * **Les faits de « Nous écrire ».** Le préfixe `contact_message.` est rangé
 * sous `commercial` dans `activity-module.ts`.
 */
export const CONTACT_MESSAGE_FACTS = {
  handled: "contact_message.handled",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * Un message vient d'être rangé. **Pas journalisé** : ce n'est pas un acte du
 * staff, et la charge porterait des données personnelles qui s'anonymisent.
 * Ses abonnés envoient le courriel à l'adresse de l'objet et font sonner la
 * cloche ; un échec de l'un ne défait pas le message.
 */
export class ContactMessageReceivedEvent {
  constructor(
    readonly message: ContactMessage,
    readonly recipientEmail: string,
  ) {}
}

/** Le staff a traité un message. Le sujet est le message, nommé par son objet. */
export class ContactMessageHandledEvent implements JournaledEvent {
  constructor(readonly message: ContactMessage) {}

  journalFact(): JournalFact {
    return {
      type: CONTACT_MESSAGE_FACTS.handled,
      subjectType: "contact_message",
      subjectId: this.message.id,
      payload: { subjectLabel: this.message.subjectLabel },
    };
  }
}
