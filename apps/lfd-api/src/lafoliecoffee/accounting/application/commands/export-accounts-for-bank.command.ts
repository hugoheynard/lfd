/**
 * Prépare un export des comptes destinataires pour le portail de la banque
 * (doc `prerequis-export-ribs.md` § 2.1). Rend l'id de l'export ; le fichier
 * se télécharge ensuite.
 *
 * Pas d'option « tous » : contrairement aux mandats, un seul compte que la
 * banque connaît déjà fait rejeter TOUT l'import (réponse 8).
 */
export class ExportAccountsForBankCommand {
  constructor(
    readonly legalEntityId: string,
    readonly staffUserId: string,
  ) {}
}
