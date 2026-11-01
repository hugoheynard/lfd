/**
 * Appliquer une opération après déploiement : exige la simulation récente de
 * la même personne sur la même image (§ 3.6), puis lance l'écriture en tâche.
 */
export class ApplyPostDeployOperationCommand {
  constructor(
    readonly operationKey: string,
    /** La fiche staff qui applique — et qui sera nommée dans les faits écrits. */
    readonly actor: string,
  ) {}
}
