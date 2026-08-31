/**
 * **Millicentimes** (10⁻⁵ €) → euros, en français.
 *
 * Le formatage vit **ici** et pas dans un pipe partagé : c'est la seule règle du
 * paquet qui touche à l'argent, et deux écrans qui l'écriraient différemment
 * afficheraient deux prix pour la même valeur.
 *
 * Il prend des **millicentimes** depuis que les prix unitaires en portent : un
 * hors taxe déduit d'un prix d'étiquette, un devis grand compte posé au volume.
 * Les montants encaissés, eux, restent en centimes et se formatent ailleurs —
 * les confondre afficherait un prix mille fois trop grand ou trop petit, et
 * c'est le genre d'erreur qu'on ne voit qu'en production.
 *
 * Et il vit dans son PROPRE fichier, séparé du composant qui l'affiche : tant
 * qu'il cohabitait avec un `@Component`, l'importer tirait `@angular/core`, que
 * le runner CJS du paquet ne sait pas charger. La seule logique testable du
 * paquet était donc intestable — et `jest` sortait en échec faute de la moindre
 * spec, ce qui a tenu la CI rouge sans que la cause soit lisible.
 */
export function formatEuros(millicents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    // Jusqu'à cinq décimales, mais **seulement si elles existent** : « 2,10 € »
    // reste « 2,10 € », il n'y a rien à annoncer. Les afficher toujours ferait
    // passer chaque prix rond pour un prix calculé.
    maximumFractionDigits: 5,
  }).format(millicents / 100_000);
}
