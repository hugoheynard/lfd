/**
 * Supprimer un raccourci du fournil (plan `fournil/plan-raccourcis-du-fournil.md`,
 * S1) : la ligne s'archive, le journal dit qui.
 */
export class RemoveBatchShortcutCommand {
  constructor(readonly shortcutId: string) {}
}
