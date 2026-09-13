/**
 * **Ressortir une ligne du bac.**
 *
 * Autorisé tant que le bac n'est pas fermé : une ligne cochée par erreur les
 * doigts farinés doit pouvoir se reprendre, et le refuser transformerait un
 * geste maladroit en incident. Aucune identité n'est nécessaire — on efface un
 * fait, on n'en écrit pas un nouveau ; qui l'a effacé se lirait dans le journal,
 * pas dans une colonne que le geste suivant remplacerait.
 */
export class UnmarkPackingLineCommand {
  constructor(
    readonly serviceDay: string,
    readonly reference: string,
    readonly sku: string,
  ) {}
}
