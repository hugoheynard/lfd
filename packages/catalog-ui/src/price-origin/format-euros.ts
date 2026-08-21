/**
 * Centimes → euros, en français.
 *
 * Le formatage vit **ici** et pas dans un pipe partagé : c'est la seule règle du
 * paquet qui touche à l'argent, et deux écrans qui l'écriraient différemment
 * afficheraient deux prix pour la même valeur.
 *
 * Et il vit dans son PROPRE fichier, séparé du composant qui l'affiche : tant
 * qu'il cohabitait avec un `@Component`, l'importer tirait `@angular/core`, que
 * le runner CJS du paquet ne sait pas charger. La seule logique testable du
 * paquet était donc intestable — et `jest` sortait en échec faute de la moindre
 * spec, ce qui a tenu la CI rouge sans que la cause soit lisible.
 */
export function formatEuros(cents: number): string {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(cents / 100);
}
