/**
 * **Décocher une ligne de la fiche d'atelier.**
 *
 * Autorisé, contrairement au colisage : une case cochée par erreur à 4 h du
 * matin doit pouvoir se reprendre, et le refuser transformerait un doigt fariné
 * en incident. Aucune identité n'est nécessaire — on efface un fait, on n'en
 * écrit pas un nouveau ; qui l'a effacé se lirait dans le journal, pas dans une
 * colonne que le geste suivant remplacerait.
 */
export class UnmarkWorksheetLineCommand {
  constructor(
    readonly serviceDay: string,
    readonly sku: string,
  ) {}
}
