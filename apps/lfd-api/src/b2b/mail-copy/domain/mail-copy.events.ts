import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../platform/journal/journal-fact.js";
import type { MailCopyChange } from "./mail-copy-entry.js";
import type { MailCopyLocale, MailCopySource } from "./mail-copy-locale.js";
import type { MailSectionOrderChange } from "./mail-section-order.js";

export const MAIL_COPY_FACTS = {
  published: "mail_copy.published",
  trialSent: "mail_copy.trial_sent",
} as const satisfies Readonly<Record<string, JournalFactType>>;

/** Le sujet de la publication : il n'y a qu'un jeu de textes publiés. */
export const MAIL_COPY_SUBJECT = "mail";

/**
 * **Les textes des e-mails ont été publiés** — UN fait par « Publier », dans
 * la transaction de la publication (C3).
 *
 * Il porte, pour chaque texte qui change, la valeur envoyée AVANT et APRÈS :
 * c'est la seule trace de ce que les e-mails disaient la veille, et de quoi
 * les y remettre à la main. Même chose pour l'ordre des sections de chaque
 * e-mail déplacé (E4) — `null` : l'ordre du code.
 *
 * ⚠️ Son préfixe `mail_copy.` est rangé côté serveur
 * (`growth/domain/activity-module.ts`) ; sa phrase au back-office vit dans
 * `shared/journal/phrases/storefront-phrases.ts`.
 */
export class MailCopyPublishedEvent implements JournaledEvent {
  constructor(
    readonly version: number,
    readonly changes: readonly MailCopyChange[],
    readonly sectionOrders: readonly MailSectionOrderChange[] = [],
  ) {}

  journalFact(): JournalFact {
    return {
      type: MAIL_COPY_FACTS.published,
      subjectType: "mail_copy",
      subjectId: MAIL_COPY_SUBJECT,
      payload: {
        subjectLabel: "Textes des e-mails",
        version: this.version,
        changes: this.changes.map((change) => ({
          mail: change.mail,
          path: change.path,
          locale: change.locale,
          before: change.before,
          after: change.after,
        })),
        // Absent quand aucun ordre ne change : le fait d'une publication de
        // textes seuls reste celui d'avant E4.
        ...(this.sectionOrders.length === 0
          ? {}
          : {
              sectionOrders: this.sectionOrders.map((change) => ({
                mail: change.mail,
                before: change.before === null ? null : [...change.before],
                after: change.after === null ? null : [...change.after],
              })),
            }),
      },
    };
  }
}

/**
 * **Un essai est parti** (C6) — à l'adresse de la personne qui l'a demandé, et
 * à elle seule. Un essai est un vrai courriel : il se trace comme un geste.
 * L'adresse n'est PAS dans la charge : c'est celle de l'auteur du fait.
 */
export class MailCopyTrialSentEvent implements JournaledEvent {
  constructor(
    readonly mail: string,
    readonly locale: MailCopyLocale,
    readonly source: MailCopySource,
  ) {}

  journalFact(): JournalFact {
    return {
      type: MAIL_COPY_FACTS.trialSent,
      subjectType: "mail_copy",
      subjectId: this.mail,
      payload: {
        subjectLabel: this.mail,
        mail: this.mail,
        locale: this.locale,
        source: this.source,
      },
    };
  }
}
