/**
 * **« Étape faite »** — un poste qui ne finit pas la ligne coche sa part (
 * `documentation/fournil/un-produit-sur-plusieurs-postes.md`, § 2.3).
 */
export class MarkStepDoneCommand {
  constructor(
    readonly serviceDay: string,
    readonly sku: string,
    readonly workstationId: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un double appui ne coche qu'une fois. */
    readonly intentKey: string,
  ) {}
}
