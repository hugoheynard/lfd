import type { JournalFact, JournaledEvent } from "../../../../platform/journal/journal-fact.js";
import type { PeriodQuoteSnapshot } from "../entities/period-quote.js";

/** Le sujet du journal d'un devis de période — une version. */
export const PERIOD_QUOTE_SUBJECT = "period_quote";
/** Valeur écrite au journal : elle ne se renomme pas. */
export const PERIOD_QUOTE_RESENT = "period_quote.resent";

/**
 * **« Renvoyer le devis »** (QD4, QD5), le geste du staff au journal : la
 * version envoyée, et si elle est neuve. Une version neuve part par l'envoi
 * automatique (`period_quote.issued`), qui compte ses destinataires lui-même :
 * `recipientCount` vaut alors `null`. Jamais d'adresse : leur nombre.
 */
export class PeriodQuoteResentEvent implements JournaledEvent {
  constructor(
    readonly quote: PeriodQuoteSnapshot,
    readonly renewed: boolean,
    readonly recipientCount: number | null,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PERIOD_QUOTE_RESENT,
      subjectType: PERIOD_QUOTE_SUBJECT,
      subjectId: this.quote.id,
      occurredAt: this.at,
      payload: {
        subjectLabel: `${this.quote.number} v${String(this.quote.version)}`,
        payer: { id: this.quote.payerCompanyId, name: this.quote.payerName },
        version: this.quote.version,
        renewed: this.renewed,
        recipientCount: this.recipientCount,
      },
    };
  }
}

/** Valeur écrite au journal : elle ne se renomme pas. */
export const PERIOD_QUOTE_NOTICE_FAILED = "period_quote.notice_failed";

/**
 * **L'envoi automatique d'une version n'a pas eu lieu** (QD4) : le payeur
 * n'a personne à prévenir — la règle de la facture, qui journalise
 * `invoice.notice_failed`. Le staff renseigne un contact, puis renvoie.
 */
export class PeriodQuoteNoticeFailedEvent implements JournaledEvent {
  constructor(
    readonly quote: PeriodQuoteSnapshot,
    readonly failure: string,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PERIOD_QUOTE_NOTICE_FAILED,
      subjectType: PERIOD_QUOTE_SUBJECT,
      subjectId: this.quote.id,
      occurredAt: this.at,
      payload: {
        subjectLabel: `${this.quote.number} v${String(this.quote.version)}`,
        payer: { id: this.quote.payerCompanyId, name: this.quote.payerName },
        version: this.quote.version,
        failure: this.failure,
      },
    };
  }
}

/** Valeur écrite au journal : elle ne se renomme pas. */
export const PERIOD_QUOTE_COMMITMENT_RECEIVED = "period_quote.commitment_received";

/**
 * **« Engagement reçu »** (QD6), le geste du staff au journal : le numéro
 * renvoyé par l'organisme, la facture émise, le nombre de commandes
 * numérotées. Écrit dans la transaction qui émet et scelle.
 */
export class PeriodQuoteCommitmentReceivedEvent implements JournaledEvent {
  constructor(
    readonly quote: PeriodQuoteSnapshot,
    readonly commitmentNumber: string,
    readonly invoice: { readonly id: string; readonly number: string },
    readonly orderCount: number,
    readonly at: Date,
  ) {}

  journalFact(): JournalFact {
    return {
      type: PERIOD_QUOTE_COMMITMENT_RECEIVED,
      subjectType: PERIOD_QUOTE_SUBJECT,
      subjectId: this.quote.id,
      occurredAt: this.at,
      payload: {
        subjectLabel: `${this.quote.number} v${String(this.quote.version)}`,
        payer: { id: this.quote.payerCompanyId, name: this.quote.payerName },
        version: this.quote.version,
        commitmentNumber: this.commitmentNumber,
        invoice: { id: this.invoice.id, name: this.invoice.number },
        orderCount: this.orderCount,
      },
    };
  }
}
