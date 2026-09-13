/**
 * **Retirer le réglage d'un contenant.**
 *
 * La fiche cessera d'afficher un contenant pour ce SKU — colonne vide, ce qui
 * est l'état honnête d'un produit dont personne n'a dit combien il en tenait.
 */
export class RemoveProductionContainerCommand {
  constructor(readonly sku: string) {}
}
