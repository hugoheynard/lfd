/**
 * Prépare un export des mandats pour le portail de la banque (plan
 * `plan-export-des-mandats-pour-la-banque.md`, § 2 bis-1). Rend l'id de
 * l'export ; le fichier se télécharge ensuite.
 *
 * `all` : tous les mandats actifs exportables ; sinon, seulement ceux que la
 * banque n'a pas sous leur compte actuel.
 */
export class ExportMandatesForBankCommand {
  constructor(
    readonly legalEntityId: string,
    readonly all: boolean,
    readonly staffUserId: string,
  ) {}
}
