/**
 * **Décocher une étape** — elle attend de nouveau (
 * `documentation/fournil/plan-produit-sur-plusieurs-postes.md`, § 2.11, point 2).
 */
export class UndoStepCommand {
  constructor(
    readonly serviceDay: string,
    readonly sku: string,
    readonly workstationId: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un double appui ne décoche qu'une fois. */
    readonly intentKey: string,
  ) {}
}
