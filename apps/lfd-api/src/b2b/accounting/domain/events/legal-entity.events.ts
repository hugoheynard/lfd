import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import { ACCOUNTING_FACTS } from "./accounting-facts.js";

/** Le sujet, écrit une fois : sept faits parlent de la même chose. */
const SUBJECT = "legal_entity";

/** Une entité émettrice vient d'être déclarée. */
export class LegalEntityDeclaredEvent implements JournaledEvent {
  constructor(
    readonly legalEntityId: string,
    readonly at: Date,
    readonly name: string,
    readonly siren: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNTING_FACTS.legalEntityDeclared,
      subjectType: SUBJECT,
      subjectId: this.legalEntityId,
      occurredAt: this.at,
      payload: { name: this.name, siren: this.siren },
    };
  }
}

/**
 * L'identité légale a été corrigée.
 *
 * Le payload porte le nom **après** correction, et pas le diff : les documents
 * déjà émis ont pris copie de l'ancien, donc le retrouver ne demande pas le
 * journal. Ce que le journal seul peut dire, c'est **quand la fiche a changé** —
 * ce qui date les documents produits de part et d'autre.
 */
export class LegalEntityCorrectedEvent implements JournaledEvent {
  constructor(
    readonly legalEntityId: string,
    readonly at: Date,
    readonly name: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNTING_FACTS.legalEntityCorrected,
      subjectType: SUBJECT,
      subjectId: this.legalEntityId,
      occurredAt: this.at,
      payload: { name: this.name },
    };
  }
}

/**
 * L'ICS a été attribué — **le fait le plus important de cette liste**.
 *
 * Il ne se produit qu'une fois par entité, il est irréversible, et à partir de
 * cet instant chaque mandat signé le porte imprimé. L'ICS figure dans le
 * payload : ce n'est pas un secret, c'est une donnée publique par destination,
 * et la retrouver dans le journal est précisément ce qu'on cherchera devant un
 * mandat contesté.
 */
export class CreditorIdentifierAssignedEvent implements JournaledEvent {
  constructor(
    readonly legalEntityId: string,
    readonly at: Date,
    readonly ics: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNTING_FACTS.creditorIdentifierAssigned,
      subjectType: SUBJECT,
      subjectId: this.legalEntityId,
      occurredAt: this.at,
      payload: { ics: this.ics },
    };
  }
}

/**
 * Le compte où l'argent arrive a changé.
 *
 * 🔴 **L'IBAN n'est PAS dans le payload**, et son absence est le sujet. Une
 * trace se relit des années plus tard, par du personnel qui n'a aucune raison de
 * connaître le compte ; y déposer l'IBAN le répandrait dans le temps et dans les
 * lecteurs. Les quatre derniers caractères suffisent à répondre à la seule
 * question qu'on posera : « vers quel compte pointait-on ce jour-là ».
 */
export class CreditorAccountChangedEvent implements JournaledEvent {
  constructor(
    readonly legalEntityId: string,
    readonly at: Date,
    readonly last4: string,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNTING_FACTS.creditorAccountChanged,
      subjectType: SUBJECT,
      subjectId: this.legalEntityId,
      occurredAt: this.at,
      payload: { last4: this.last4 },
    };
  }
}

/** Le délai annoncé au débiteur a été renégocié avec la banque. */
export class PreNotificationChangedEvent implements JournaledEvent {
  constructor(
    readonly legalEntityId: string,
    readonly at: Date,
    readonly days: number,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNTING_FACTS.preNotificationChanged,
      subjectType: SUBJECT,
      subjectId: this.legalEntityId,
      occurredAt: this.at,
      payload: { days: this.days },
    };
  }
}

/** L'entité n'émet plus, ou réémet. Un seul fait, un drapeau : c'est la même bascule. */
export class LegalEntityArchivalChangedEvent implements JournaledEvent {
  constructor(
    readonly legalEntityId: string,
    readonly at: Date,
    readonly archived: boolean,
  ) {}

  journalFact(): JournalFact {
    return {
      type: this.archived
        ? ACCOUNTING_FACTS.legalEntityArchived
        : ACCOUNTING_FACTS.legalEntityRestored,
      subjectType: SUBJECT,
      subjectId: this.legalEntityId,
      occurredAt: this.at,
      payload: {},
    };
  }
}
