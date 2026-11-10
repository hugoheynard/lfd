/** Ajoute un code NAF ciblé (catégorie d'acteurs visés) à la config marché. */
export class AddMarketNafCommand {
  constructor(
    readonly code: string,
    readonly label: string,
  ) {}
}
