import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { FoldSearchComponent } from 'fold-ng';

/**
 * `lfd-product-search` — **la barre de recherche de produits**, la même sur
 * chaque écran : la saisie et le nombre de produits trouvés, annoncé.
 *
 * Elle ne porte que la saisie. L'écran garde la main sur sa liste : il compose
 * ses propres filtres (rayon, poste…) puis appelle `searchProducts`
 * (`@lfd/b2b-ui/search`) dans son `computed`, et rend le nombre à `count`.
 * Le composant ne connaît donc aucun type d'article.
 */
@Component({
  selector: 'lfd-product-search',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldSearchComponent],
  templateUrl: './product-search.html',
  styleUrl: './product-search.scss',
})
export class ProductSearch {
  /** La requête tapée, à chaque frappe — la liste filtrée en mémoire n'attend pas. */
  readonly query = model('');
  /** Le nombre de produits retenus — `null` n'affiche rien. */
  readonly count = input<number | null>(null);
  readonly placeholder = input('Chercher un produit');
  readonly ariaLabel = input('Chercher un produit');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
}
