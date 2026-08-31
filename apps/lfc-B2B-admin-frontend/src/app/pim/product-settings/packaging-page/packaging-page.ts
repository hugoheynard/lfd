import { ChangeDetectionStrategy, Component } from '@angular/core';

import { FoldCalloutComponent, FoldEmptyStateComponent, FoldPageLayoutComponent } from 'fold-ng';

/**
 * **Conditionnements** — l'écran est POSÉ, la fonction reste à écrire.
 *
 * La table existe (`product_packaging`) : une déclinaison peut porter des
 * conditionnements, chacun avec sa propre référence, sa quantité, son poids
 * brut et son prix. Rien ne les saisit encore, ni ici ni sur la fiche.
 *
 * Ce qui viendra ICI est le vocabulaire — les TYPES de conditionnement, ce
 * qu'ils nomment. Combien d'unités dans le carton d'un produit donné reste sur
 * la fiche : c'est une propriété de ce produit, pas un réglage de la maison.
 */
@Component({
  selector: 'app-packaging-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageLayoutComponent, FoldEmptyStateComponent, FoldCalloutComponent],
  templateUrl: './packaging-page.html',
})
export class PackagingPage {}
