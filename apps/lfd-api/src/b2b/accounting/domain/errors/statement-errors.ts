import {
  DomainError,
  ResourceNotFoundError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **relevé de cycle** — à part de `accounting-errors.ts`, qui
 * porte l'entité émettrice et le prélèvement et touche déjà sa borne de taille.
 */

/** Le mois demandé n'est pas un mois civil `AAAA-MM`. */
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
