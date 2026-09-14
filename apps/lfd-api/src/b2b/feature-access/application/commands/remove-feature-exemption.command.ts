/**
 * Retirer une adresse de la liste d'exemption d'une clé.
 *
 * Comme le retour au défaut, la clé n'est pas confrontée au catalogue : c'est
 * ainsi qu'on retire une exemption restée sous une clé disparue.
 */
export class RemoveFeatureExemptionCommand {
  constructor(
    readonly key: string,
    readonly id: string,
  ) {}
}
