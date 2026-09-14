/**
 * Poser une dérogation au défaut du code. Acte **staff** : `staffSub` est figé
 * dans la ligne avec le nom et le rôle de l'agent.
 */
export class SetFeatureOverrideCommand {
  constructor(
    readonly key: string,
    readonly value: string,
    readonly staffSub: string,
  ) {}
}
