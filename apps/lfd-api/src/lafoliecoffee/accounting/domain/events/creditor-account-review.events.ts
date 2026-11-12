import type { JournalFactType } from "@lfd/contracts/journal-facts";

import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { PendingCreditorAccount } from "../value-objects/pending-creditor-account.js";
import { ACCOUNTING_FACTS } from "./accounting-facts.js";
import type { LegalEntitySubject } from "./legal-entity.events.js";

const SUBJECT = "legal_entity";

/**
 * Ce que la cloche de la comptabilité annonce d'un geste du compte aux quatre
 * yeux. Chaque fait le rédige lui-même : l'abonné qui sonne n'a ni `switch`
 * ni branche par fait, et un quatrième geste n'est qu'une classe de plus.
 */
export interface CreditorAccountBell {
  /** Nature du fait, et préfixe de la clé anti-doublon. */
  readonly kind: string;
  readonly subject: string;
  readonly body: string;
}

/** Un geste du compte aux quatre yeux : journalisé, et sonné à la comptabilité. */
export interface CreditorAccountReviewEvent extends JournaledEvent {
  readonly entity: LegalEntitySubject;
  readonly pending: PendingCreditorAccount;
  readonly at: Date;
  bell(): CreditorAccountBell;
}

/**
 * Une modification du compte est proposée : elle attend qu'un autre membre de
 * la comptabilité la confirme. Le journal n'en garde que les quatre derniers
 * caractères de l'IBAN.
 */
export class CreditorAccountProposedEvent implements CreditorAccountReviewEvent {
  constructor(
    readonly entity: LegalEntitySubject,
    readonly pending: PendingCreditorAccount,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return reviewFact(ACCOUNTING_FACTS.creditorAccountProposed, this);
  }

  bell(): CreditorAccountBell {
    return {
      kind: "legal_entity.creditor_account_proposed",
      subject: `Compte bancaire à confirmer — ${this.entity.name}`,
      body:
        `Un nouveau compte (•••• ${this.pending.last4()}) est proposé pour l'entité. Un autre ` +
        `membre de la comptabilité doit le confirmer en ressaisissant l'IBAN depuis le RIB de ` +
        `la banque ; d'ici là, les factures et les prélèvements gardent l'ancien compte.`,
    };
  }
}

/**
 * La proposition est confirmée par un second membre : elle devient LE compte.
 * Journalisée sous le même fait que la première saisie — le compte confirmé a
 * changé —, sonnée à part.
 */
export class CreditorAccountConfirmedEvent implements CreditorAccountReviewEvent {
  constructor(
    readonly entity: LegalEntitySubject,
    readonly pending: PendingCreditorAccount,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: ACCOUNTING_FACTS.creditorAccountChanged,
      subjectType: SUBJECT,
      subjectId: this.entity.id,
      occurredAt: this.at,
      payload: { subjectLabel: this.entity.name, last4: this.pending.last4() },
    };
  }

  bell(): CreditorAccountBell {
    return {
      kind: "legal_entity.creditor_account_confirmed",
      subject: `Compte bancaire confirmé — ${this.entity.name}`,
      body:
        `Le compte •••• ${this.pending.last4()} est confirmé : les prochaines factures et les ` +
        `prochains prélèvements le portent. Si personne ne l'a demandé, prévenez la direction.`,
    };
  }
}

/** La proposition est annulée ; le compte confirmé ne bouge pas. */
export class CreditorAccountProposalCancelledEvent implements CreditorAccountReviewEvent {
  constructor(
    readonly entity: LegalEntitySubject,
    readonly pending: PendingCreditorAccount,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return reviewFact(ACCOUNTING_FACTS.creditorAccountProposalCancelled, this);
  }

  bell(): CreditorAccountBell {
    return {
      kind: "legal_entity.creditor_account_proposal_cancelled",
      subject: `Changement de compte bancaire annulé — ${this.entity.name}`,
      body:
        `La proposition du compte •••• ${this.pending.last4()} est annulée. Les factures et ` +
        `les prélèvements gardent le compte confirmé.`,
    };
  }
}

function reviewFact(type: JournalFactType, event: CreditorAccountReviewEvent): JournalFact {
  return {
    type,
    subjectType: SUBJECT,
    subjectId: event.entity.id,
    occurredAt: event.at,
    payload: {
      subjectLabel: event.entity.name,
      pendingId: event.pending.id,
      last4: event.pending.last4(),
    },
  };
}
