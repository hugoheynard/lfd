import { TechnicalError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus de **l'arrêté de facturation** (plan
 * `documentation/facturation/plan-le-prelevement-suit-la-facture.md`, F3).
 *
 * Tous deux sont inatteignables par la constitution d'aujourd'hui : ils
 * refusent un arrêté que le code aurait mal assemblé, plutôt que de figer une
 * pièce fausse. D'où la catégorie technique — personne au bureau ne peut les
 * corriger, et le message le dit.
 */

/** Un arrêté sans bon ne couvre rien : la ligne de débit en a toujours un. */
export class StatementWithoutOrdersError extends TechnicalError {
  constructor(
    readonly batchId: string,
    readonly lineRank: number,
  ) {
    super(
      "accounting.billing_statement.without_orders",
      `L'arrêté de la ligne ${String(lineRank)} du lot ${batchId} ne couvre aucun bon : la constitution est annulée, rien n'est écrit. Prévenir l'équipe technique.`,
    );
  }
}

/**
 * Le montant de la ligne de débit n'est pas le total de son arrêté : la banque
 * prélèverait un autre chiffre que celui de la facture.
 */
export class StatementTotalMismatchError extends TechnicalError {
  constructor(
    readonly batchId: string,
    readonly lineRank: number,
    readonly lineAmountCents: number,
    readonly statementTotalCents: number,
  ) {
    super(
      "accounting.billing_statement.total_mismatch",
      `La ligne ${String(lineRank)} du lot ${batchId} prélèverait ${String(lineAmountCents)} c alors que son arrêté totalise ${String(statementTotalCents)} c : la constitution est annulée, rien n'est écrit. Prévenir l'équipe technique.`,
    );
  }
}

/**
 * La ligne n'a pas de quoi figer son arrêté : la société payeuse est absente
 * de l'annuaire, ou la ligne n'a pas de facture calculée. Une commande cite
 * toujours une société existante : inatteignable tant que la clé tient.
 */
export class StatementBuyerMissingError extends TechnicalError {
  constructor(
    readonly batchId: string,
    readonly lineRank: number,
    readonly payerCompanyId: string,
  ) {
    super(
      "accounting.billing_statement.source_missing",
      `L'arrêté de la ligne ${String(lineRank)} du lot ${batchId} ne peut pas être figé : la société payeuse ${payerCompanyId} est introuvable, ou la ligne n'a pas de facture calculée. La constitution est annulée, rien n'est écrit. Prévenir l'équipe technique.`,
    );
  }
}
