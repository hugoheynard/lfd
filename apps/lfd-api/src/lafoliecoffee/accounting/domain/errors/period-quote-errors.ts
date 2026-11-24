import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

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

/** Les mots d'un état final, tels que la comptabilité les lit. */
const FINAL_STATE_WORDS: Readonly<Record<string, string>> = {
  invoiced: "est déjà facturé : sa facture a été émise à la réception du numéro d'engagement",
  superseded: "a été remplacé par une version plus récente",
};

/** « Renvoyer » un devis qui n'attend plus son engagement. */
export class PeriodQuoteNotAwaitingError extends BusinessError {
  constructor(
    readonly number: string,
    readonly version: number,
    readonly state: string,
  ) {
    super(
      "accounting.period_quote.not_awaiting",
      `Le devis ${number} (version ${String(version)}) ${FINAL_STATE_WORDS[state] ?? `est « ${state} »`} : ` +
        "il ne se renvoie plus. Relire la liste des devis de la société et renvoyer la version en attente.",
    );
  }
}

/** Un devis inconnu. */
export class PeriodQuoteNotFoundError extends ResourceNotFoundError {
  constructor(readonly quoteId: string) {
    super(
      "accounting.period_quote.not_found",
      `Aucun devis de période ne porte l'identifiant ${quoteId}. Relire la liste des devis de la société.`,
    );
  }
}

/**
 * Le renvoi range une version n+1 et la base la refuse : une autre version
 * vivante du même groupe, ou une de ses commandes déjà dans un autre devis en
 * attente. Rien n'est écrit.
 */
export class PeriodQuoteResendConflictError extends BusinessError {
  constructor(readonly number: string) {
    super(
      "accounting.period_quote.resend_conflict",
      `La nouvelle version du devis ${number} n'a pas pu être rangée : un autre devis en attente ` +
        "porte déjà ce groupe ou une de ses commandes. Rien n'a été envoyé ; relire les devis de la société.",
    );
  }
}

/** Le devis n'a personne à qui partir : ni contact de facturation, ni détenteur joignable. */
export class PeriodQuoteNobodyToNotifyError extends BusinessError {
  constructor(readonly number: string) {
    super(
      "accounting.period_quote.nobody_to_notify",
      `Le devis ${number} n'a été envoyé à personne : la société payeuse n'a ni contact de ` +
        "facturation ni détenteur joignable. Renseigner un contact de facturation sur sa fiche, puis renvoyer.",
    );
  }
}

/**
 * Le PDF d'un devis ne se rend que sur les commandes qu'il a chiffrées : une
 * empreinte qui a changé depuis veut un renvoi (une nouvelle version), pas un
 * document qui contredirait le devis rangé.
 */
export class PeriodQuoteOutdatedError extends BusinessError {
  constructor(
    readonly number: string,
    readonly version: number,
  ) {
    super(
      "accounting.period_quote.outdated",
      `Le devis ${number} (version ${String(version)}) n'est plus à jour : ses commandes ont changé ` +
        "depuis qu'il a été rangé. Son document n'est pas rendu ; utiliser « Renvoyer le devis », qui en range une nouvelle version.",
    );
  }
}

/** `period_quote.state` porte une valeur que le CHECK aurait dû refuser. */
export class UnknownPeriodQuoteStateError extends TechnicalError {
  constructor(
    readonly quoteId: string,
    readonly raw: string,
  ) {
    super(
      "accounting.period_quote.unknown_state",
      `Le devis ${quoteId} porte l'état inconnu « ${raw} » : il ne peut être ni rendu ni renvoyé. ` +
        "Le signaler à l'équipe technique.",
    );
  }
}

/** L'entité d'un devis est introuvable : la clé étrangère l'interdit, rien n'est rendu. */
export class PeriodQuoteSellerMissingError extends TechnicalError {
  constructor(readonly legalEntityId: string) {
    super(
      "accounting.period_quote.seller_missing",
      `L'entité juridique ${legalEntityId} d'un devis de période est introuvable : son document ` +
        "n'est pas rendu. Le signaler à l'équipe technique.",
    );
  }
}

/** Les mots d'un état final, pour « Engagement reçu ». */
const CLOSED_FOR_COMMITMENT: Readonly<Record<string, string>> = {
  invoiced: "est déjà facturé : son engagement a été enregistré et sa facture émise",
  superseded: "a été remplacé par une version plus récente : enregistrez l'engagement sur celle-ci",
};

/** « Engagement reçu » sur un devis qui n'attend plus son numéro. */
export class PeriodQuoteCommitmentClosedError extends BusinessError {
  constructor(
    readonly number: string,
    readonly version: number,
    readonly state: string,
  ) {
    super(
      "accounting.period_quote.commitment_closed",
      `Le devis ${number} (version ${String(version)}) ${CLOSED_FOR_COMMITMENT[state] ?? `est « ${state} »`}. ` +
        "Rien n'est enregistré ; relire la liste des devis de la société.",
    );
  }
}

/**
 * « Engagement reçu » sur un devis dont les commandes ont changé depuis
 * l'envoi : la facture ne serait plus celle que l'organisme a engagée.
 */
export class PeriodQuoteCommitmentOutdatedError extends BusinessError {
  constructor(
    readonly number: string,
    readonly version: number,
  ) {
    super(
      "accounting.period_quote.commitment_outdated",
      `Le devis n° ${number} (version ${String(version)}) n'est plus à jour : renvoyez-le avant ` +
        "d'enregistrer l'engagement. Ses commandes ont changé depuis son envoi ; rien n'est enregistré.",
    );
  }
}

/**
 * Les commandes du devis, numérotées, ne font plus UNE facture : un mandat ou
 * un code service a changé depuis le rangement, ou la facture de ce groupe
 * est déjà émise. Rien n'est enregistré.
 */
export class PeriodQuoteCommitmentGroupsError extends BusinessError {
  constructor(
    readonly number: string,
    readonly groups: number,
  ) {
    super(
      "accounting.period_quote.commitment_groups",
      groups === 0
        ? `La facture du devis ${number} est déjà émise pour cette période et cet engagement : ` +
            "rien n'est enregistré. Relire les factures de la période."
        : `Les commandes du devis ${number} ne tiennent plus en une seule facture (${String(groups)} ` +
            "groupes : mandat ou code service différents) : rien n'est enregistré. Renvoyez le devis, " +
            "ou signalez-le à l'équipe technique si le refus revient.",
    );
  }
}

/**
 * Le PDF d'une version n'est pas encore rangé : son envoi automatique ne
 * l'a pas rendu (personne à prévenir, ou commandes changées depuis).
 */
export class PeriodQuoteDocumentNotRenderedError extends ResourceNotFoundError {
  constructor(
    readonly number: string,
    readonly version: number,
  ) {
    super(
      "accounting.period_quote.document_not_rendered",
      `Le document du devis ${number} (version ${String(version)}) n'est pas encore rendu : ` +
        "son envoi n'a pas eu lieu. Utiliser « Renvoyer le devis », qui le rend et l'envoie.",
    );
  }
}

/** La fiche demandée n'est aucun compte client. */
export class PeriodQuoteCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "accounting.period_quote.company_not_found",
      `Aucun compte client « ${companyId} » : les devis de période se lisent sur un compte existant.`,
    );
  }
}
