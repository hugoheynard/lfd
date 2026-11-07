import {
  MAIL_SPACE_LABELS,
  senderDomainOf,
  type MailSenderIdentity,
  type MailSpace,
} from "@lfd/mail-blocks";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * Le fait de l'identité d'envoi d'un espace (plan `plan-editeur-par-blocs.md`,
 * § 25, C3), rangé sous `mail_copy.` comme la charte : le même métier.
 */
export const MAIL_SENDER_FACTS = {
  changed: "mail_copy.sender_changed",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/**
 * **L'identité d'envoi d'un espace est changée** — son domaine était vérifié
 * et un essai est parti sous elle. Les adresses ne vont pas au journal : le
 * domaine d'envoi dit au nom de qui l'espace écrit, la table garde le reste.
 */
export class MailSenderChangedEvent implements JournaledEvent {
  constructor(
    readonly space: MailSpace,
    readonly revision: number,
    readonly identity: MailSenderIdentity,
    readonly publicationVersion: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: MAIL_SENDER_FACTS.changed,
      subjectType: "mail_sender",
      subjectId: this.space,
      payload: {
        subjectLabel: MAIL_SPACE_LABELS[this.space],
        space: this.space,
        revision: this.revision,
        senderName: this.identity.senderName,
        fromDomain: senderDomainOf(this.identity.fromAddress),
        publicationVersion: this.publicationVersion,
      },
    };
  }
}
