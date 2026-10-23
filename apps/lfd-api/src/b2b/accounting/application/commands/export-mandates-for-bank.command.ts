/**
 * Prépare un export des mandats pour le portail de la banque (plan
 * `export-des-mandats-pour-la-banque.md`). Rend l'id de
 * l'export ; le fichier se télécharge ensuite.
 * Seulement les mandats que la banque n'a pas sous leur compte actuel : la
 * banque rejette l'import entier si un seul lui est déjà connu (réponse 12),
 * d'où le retrait de l'option « tous » le 2026-10-23.
 */
export class ExportMandatesForBankCommand {
  constructor(
    readonly legalEntityId: string,
    readonly staffUserId: string,
  ) {}
}
