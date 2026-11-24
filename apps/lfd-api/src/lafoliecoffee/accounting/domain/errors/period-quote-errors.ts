import { DomainError, TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **devis de période** (plan `plan-clients-publics-chorus.md`,
 * § 6 sexies). Un refus à la clôture n'atteint jamais un écran directement :
 * la clôture le range comme le refus d'une facture (`invoice_monthly_outcome`,
 * signalé), et le message est lu par la comptabilité.
 */

/** Un devis sans commande : il n'y aurait rien à engager. */
export class EmptyPeriodQuoteError extends DomainError {
  constructor(readonly payerName: string) {
    super(
      "accounting.period_quote.empty",
      `Le devis de période de « ${payerName} » n'aurait aucune commande : rien n'est rangé. ` +
        "Relancer la clôture ; si le refus revient, le signaler à l'équipe technique.",
    );
  }
}

/** Un rang de devis qui n'est pas un entier positif. */
export class InvalidPeriodQuoteRankError extends DomainError {
  constructor(readonly rank: number) {
    super(
      "accounting.period_quote.invalid_rank",
      `Le rang de devis ${String(rank)} n'est pas un entier positif : le compteur des devis est ` +
        "incohérent, rien n'est rangé. Le signaler à l'équipe technique.",
    );
  }
}

/**
 * Une autre clôture a rangé ces commandes dans un devis entre la lecture et
 * l'écriture : la transaction est défaite, le devis déjà rangé fait foi.
 */
export class PeriodQuoteOrdersTakenError extends TechnicalError {
  constructor(readonly payerName: string) {
    super(
      "accounting.period_quote.orders_taken",
      `Les commandes de « ${payerName} » ont été rangées dans un autre devis pendant la clôture : ` +
        "rien n'est rangé par ce passage. Relire la période : le devis déjà rangé fait foi.",
    );
  }
}

/** `company_chorus_routing.commitment_timing` porte une valeur que le CHECK aurait dû refuser. */
export class UnknownCommitmentTimingError extends TechnicalError {
  constructor(readonly raw: string) {
    super(
      "accounting.period_quote.unknown_commitment_timing",
      `Le moment de l'engagement « ${raw} » de la fiche Chorus Pro est inconnu : la clôture ne sait ` +
        "pas si elle doit émettre ou mettre en devis. Le signaler à l'équipe technique.",
    );
  }
}
