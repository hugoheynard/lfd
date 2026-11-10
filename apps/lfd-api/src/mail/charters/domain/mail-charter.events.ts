import { MAIL_SPACE_LABELS, type MailSpace } from "@lfd/mail-blocks";
import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * Les faits de la charte d'un espace (plan `plan-editeur-par-blocs.md`,
 * § 25, C1). Rangés sous le préfixe `mail_copy.` — le même métier que les
 * textes et les documents des e-mails, et le même rangement côté serveur
 * (`lafoliecoffee/growth/domain/activity-module.ts`).
 */
export const MAIL_CHARTER_FACTS = {
  saved: "mail_copy.charter_saved",
  published: "mail_copy.charter_published",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet : une charte par espace. */
const SUBJECT_TYPE = "mail_charter";

/** **Le brouillon de la charte est enregistré.** Les réglages restent dans leur table. */
export class MailCharterSavedEvent implements JournaledEvent {
  constructor(
    readonly space: MailSpace,
    readonly revision: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: MAIL_CHARTER_FACTS.saved,
      subjectType: SUBJECT_TYPE,
      subjectId: this.space,
      payload: {
        subjectLabel: MAIL_SPACE_LABELS[this.space],
        space: this.space,
        revision: this.revision,
      },
    };
  }
}

/**
 * **La charte est publiée** : elle vaut pour tous les e-mails de l'espace,
 * sous la version des textes `publicationVersion` — l'estampille du cache.
 */
export class MailCharterPublishedEvent implements JournaledEvent {
  constructor(
    readonly space: MailSpace,
    readonly version: number,
    readonly previousVersion: number | null,
    readonly publicationVersion: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: MAIL_CHARTER_FACTS.published,
      subjectType: SUBJECT_TYPE,
      subjectId: this.space,
      payload: {
        subjectLabel: MAIL_SPACE_LABELS[this.space],
        space: this.space,
        version: this.version,
        previousVersion: this.previousVersion,
        publicationVersion: this.publicationVersion,
      },
    };
  }
}
