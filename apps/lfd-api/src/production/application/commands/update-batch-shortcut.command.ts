/**
 * Modifier le nom ou les pièces d'un raccourci du fournil (plan
 * `fournil/plan-raccourcis-du-fournil.md`, S1). Le produit ne change pas.
 */
export class UpdateBatchShortcutCommand {
  constructor(
    readonly shortcutId: string,
    readonly label: string,
    readonly pieces: number,
  ) {}
}
