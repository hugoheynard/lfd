/**
 * Supprimer un raccourci du fournil (plan `fournil/la-fiche-d-atelier.md`,
 * S1) : la ligne s'archive, le journal dit qui.
 */
export class RemoveBatchShortcutCommand {
  constructor(readonly shortcutId: string) {}
}
