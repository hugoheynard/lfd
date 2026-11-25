/**
 * **Le rouge d'une étape** — un poste qui ne finit pas la ligne dit que sa
 * part ne se fera pas, avec une raison s'il veut ; sans plafond (
 * `documentation/fournil/plan-produit-sur-plusieurs-postes.md`, § 1).
 */
export class MarkStepRedCommand {
  constructor(
    readonly serviceDay: string,
    readonly sku: string,
    readonly workstationId: string,
    /** Brute ; vide ou absente = aucune raison. */
    readonly reason: string | null,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
    /** La clé d'intention de l'écran : un double appui ne refait pas le rouge. */
    readonly intentKey: string,
  ) {}
}
