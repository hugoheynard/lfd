/**
 * **« Tournée terminée »** par le livreur, sur SA tournée
 * (`parcours-du-livreur.md`, PL2). `staffUserId` est la fiche de la requête :
 * c'est le mur.
 */
export class ReturnMyRoundCommand {
  constructor(
    readonly staffUserId: string,
    readonly roundId: string,
  ) {}
}
