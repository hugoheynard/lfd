import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";

/**
 * Les faits du document d'un e-mail (plan `plan-editeur-par-blocs.md`, § 5,
 * S4c). Rangés sous le préfixe `mail_copy.` — le même métier que les textes
 * des e-mails, et le même rangement côté serveur
 * (`growth/domain/activity-module.ts`).
 */
export const MAIL_DOCUMENT_FACTS = {
  saved: "mail_copy.document_saved",
  published: "mail_copy.document_published",
  retracted: "mail_copy.document_retracted",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet : un document par e-mail du registre. */
const SUBJECT_TYPE = "mail_document";

/** **Le brouillon de l'arrangement est enregistré.** Le document reste dans sa table. */
export class MailDocumentSavedEvent implements JournaledEvent {
  constructor(
    readonly template: string,
    readonly revision: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: MAIL_DOCUMENT_FACTS.saved,
      subjectType: SUBJECT_TYPE,
      subjectId: this.template,
      payload: { subjectLabel: this.template, mail: this.template, revision: this.revision },
    };
  }
}

/**
 * **L'arrangement est publié**, dans la publication `publicationVersion` des
 * textes des e-mails — un seul « Publier » pour l'arrangement et les phrases.
 */
export class MailDocumentPublishedEvent implements JournaledEvent {
  constructor(
    readonly template: string,
    readonly version: number,
    readonly previousVersion: number | null,
    readonly publicationVersion: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: MAIL_DOCUMENT_FACTS.published,
      subjectType: SUBJECT_TYPE,
      subjectId: this.template,
      payload: {
        subjectLabel: this.template,
        mail: this.template,
        version: this.version,
        previousVersion: this.previousVersion,
        publicationVersion: this.publicationVersion,
      },
    };
  }
}

/** **L'e-mail revient au modèle d'origine** : `version` retirée, `null` s'il n'y avait qu'un brouillon. */
export class MailDocumentRetractedEvent implements JournaledEvent {
  constructor(
    readonly template: string,
    readonly version: number | null,
    readonly publicationVersion: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: MAIL_DOCUMENT_FACTS.retracted,
      subjectType: SUBJECT_TYPE,
      subjectId: this.template,
      payload: {
        subjectLabel: this.template,
        mail: this.template,
        version: this.version,
        publicationVersion: this.publicationVersion,
      },
    };
  }
}
