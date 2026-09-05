import { Injectable, signal } from '@angular/core';

import { ALL_SHELVES } from './mock-shop';

/**
 * **Ce que le client regarde** — le terme cherché, et le rayon choisi.
 *
 * Deux signaux, et c'est tout ce que la boutique retient. Ce qu'elle MONTRE
 * n'est pas ici : la liste des pièces et le titre qui les coiffe se déduisent de
 * ces deux-là, et une boutique qui stockerait aussi sa liste aurait deux vérités
 * à tenir d'accord. Les règles qui les déduisent — et celle qui dit que choisir
 * un rayon oublie le terme — vivent dans {@link Shop}.
 *
 * 🔴 **Il n'est pas `providedIn: 'root'`, et c'est une décision.** La page le
 * fournit, donc il naît et meurt avec l'écran : revenir à la boutique la rouvre
 * sur « Tout », comme aujourd'hui. Un singleton la rouvrirait sur le dernier
 * rayon parcouru — ce qui se défend, mais c'est un choix de produit et pas une
 * conséquence de la découpe. Le jour où on le veut, c'est cette ligne-ci qui
 * change, et rien d'autre.
 *
 * Rien n'est relu du navigateur non plus, contrairement au panier et au mode de
 * service : ce qu'on cherche est une intention du moment, pas un engagement.
 * Retrouver « eclair » dans le champ trois jours plus tard serait une surprise,
 * pas un service.
 */
@Injectable()
export class ShopStore {
  /** Le terme cherché, tel qu'il est tapé — jamais rogné, c'est la vue du champ. */
  readonly query = signal('');

  /** Le rayon choisi. `ALL_SHELVES` = aucun filtre, et c'est le défaut. */
  readonly shelf = signal<string>(ALL_SHELVES);
}
