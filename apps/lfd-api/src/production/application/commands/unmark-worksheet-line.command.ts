/**
 * **Décocher une ligne de la fiche d'atelier.**
 *
 * Autorisé, contrairement au colisage : une case cochée par erreur à 4 h du
 * matin doit pouvoir se reprendre, et le refuser transformerait un doigt fariné
 * en incident.
 *
 * Depuis les fournées (plan `plan-fournees-progressives.md`, D3), décocher
 * ANNULE toutes les fournées de la ligne — et une annulation est tracée par son
 * auteur. D'où l'identité, que la commande ne portait pas quand décocher
 * effaçait un fait sans en écrire.
 */
export class UnmarkWorksheetLineCommand {
  constructor(
    readonly serviceDay: string,
    readonly sku: string,
    /** L'identité staff, résolue par le guard. Jamais dans la charge utile. */
    readonly staffUserId: string,
  ) {}
}
