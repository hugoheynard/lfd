/**
 * Revenir au défaut du code : supprimer la dérogation d'une clé.
 *
 * La clé n'est PAS confrontée au catalogue : c'est le seul geste qui permet de
 * retirer une ligne dont la clé a disparu du code, et que l'écran signale.
 */
export class ClearFeatureOverrideCommand {
  constructor(readonly key: string) {}
}
