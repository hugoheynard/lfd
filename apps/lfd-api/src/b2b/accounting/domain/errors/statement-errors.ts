import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **relevé de cycle** — à part de `accounting-errors.ts`, qui
 * porte l'entité émettrice et le prélèvement et touche déjà sa borne de taille.
 */

const LONG_MOMENT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

/**
 * Le mois demandé (`StatementMonth`, mois civil — gardé pour les e2e et
 * les épreuves qui construisent des mois ; le relevé lit des périodes depuis R5)
 * n'est pas un mois civil `AAAA-MM`.
 */
export class InvalidStatementMonthError extends DomainError {
  constructor(readonly raw: string) {
    super(
      "accounting.statement.invalid_month",
      `Mois de relevé « ${raw} » illisible : attendu AAAA-MM, par exemple 2026-09.`,
    );
  }
}

/**
 * Le relevé d'un mois qui n'a pas encore commencé. Il serait vide, et un
 * relevé vide d'un mois futur se lirait comme « ce client ne doit rien ».
 */
export class FutureStatementMonthError extends DomainError {
  constructor(readonly month: string) {
    super(
      "accounting.statement.future_month",
      `Le relevé de ${month} n'existe pas encore : ce mois n'a pas commencé. ` +
        `Choisissez le mois en cours ou un mois passé.`,
    );
  }
}

/** La clôture demandée n'est pas un instant lisible. */
export class InvalidStatementPeriodError extends DomainError {
  constructor(readonly raw: string) {
    super(
      "accounting.statement.invalid_period",
      `Période de relevé « ${raw} » illisible : attendu l'instant ISO 8601 de sa clôture, ` +
        "celui que le sélecteur de période envoie.",
    );
  }
}

/**
 * L'instant demandé n'est pas une clôture de la société du relevé (lue comme
 * payeur, M4a) : il ne ferme aucune de ses périodes.
 */
export class NotAStatementPeriodError extends DomainError {
  constructor(readonly closesAt: Date) {
    super(
      "accounting.statement.not_a_period",
      `Le ${LONG_MOMENT.format(closesAt)} (heure de Paris) ne clôt aucune période de facturation ` +
        "de ce client (son mode, ou le mensuel par défaut) : choisissez une période proposée par " +
        "le sélecteur du relevé.",
    );
  }
}

/**
 * Le relevé d'une période qui n'a pas encore commencé. Il serait vide, et un
 * relevé vide d'une période future se lirait comme « ce client ne doit rien ».
 */
export class FutureStatementPeriodError extends DomainError {
  constructor(readonly label: string) {
    super(
      "accounting.statement.future_period",
      `Le relevé de la période ${label} n'existe pas encore : elle n'a pas commencé. ` +
        "Choisissez la période en cours ou une période passée.",
    );
  }
}

/**
 * Plusieurs entités émettrices sont en service, à des dates de facturation
 * différentes : le relevé ne sait pas lesquelles lire, et n'en choisit pas au
 * hasard (Q4 : une seule encaisse).
 */
export class SeveralStatementIssuersError extends BusinessError {
  constructor(readonly count: number) {
    super(
      "accounting.statement.several_issuers",
      `${String(count)} entités émettrices sont en service, à des dates de facturation ` +
        "différentes (dates des modes, ou mode d'un client) : le relevé ne sait pas lesquelles " +
        "suivre. Archivez celle qui n'encaisse pas, ou alignez leurs dates (Comptabilité › " +
        "Entités juridiques).",
    );
  }
}

/** La société demandée n'existe pas. */
export class StatementCompanyNotFoundError extends ResourceNotFoundError {
  constructor(readonly companyId: string) {
    super(
      "accounting.statement.company_not_found",
      `Aucune société « ${companyId} » : le relevé ne peut pas être lu. ` +
        `Rouvrez la fiche depuis la liste des comptes clients.`,
    );
  }
}
