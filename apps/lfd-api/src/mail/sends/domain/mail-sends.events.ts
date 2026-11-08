import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * Les faits du suivi des e-mails (plan `plan-suivi-des-e-mails.md`, T2),
 * gardés au journal pour la lisibilité : la consultation se lit dans l'écran
 * Journal, parmi les autres gestes (Hugo, 2026-11-08).
 */
export const MAIL_SEND_FACTS = {
  recipientRevealed: "mail.recipient_revealed",
  recipientSearched: "mail.recipient_searched",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * **L'adresse d'un envoi est révélée.** L'acteur est celui de la ligne du
 * journal ; l'adresse n'est JAMAIS dans la charge.
 */
export class MailRecipientRevealedEvent implements JournaledEvent {
  constructor(
    readonly sendId: string,
    readonly template: string,
    readonly space: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: MAIL_SEND_FACTS.recipientRevealed,
      subjectType: "mail_send",
      subjectId: this.sendId,
      payload: { subjectLabel: this.template, mail: this.template, space: this.space },
    };
  }
}

/**
 * **Les envois d'une adresse sont cherchés.** Ni l'adresse ni son empreinte
 * ne vont au journal : le nombre trouvé suffit à lire le geste.
 */
export class MailRecipientSearchedEvent implements JournaledEvent {
  constructor(
    readonly searchId: string,
    readonly found: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: MAIL_SEND_FACTS.recipientSearched,
      subjectType: "mail_recipient_search",
      subjectId: this.searchId,
      payload: { found: this.found },
    };
  }
}
