/**
 * Déclare un compte « déjà connu de la banque », sans fichier (doc
 * `prerequis-export-ribs.md` § 2.6) — saisi à la main dans CENET, ou importé
 * depuis le fichier que CENET produit lui-même. Rend l'id de la déclaration.
 */
export class DeclareBankAccountKnownCommand {
  constructor(
    readonly legalEntityId: string,
    readonly bankAccountId: string,
    readonly staffUserId: string,
  ) {}
}
