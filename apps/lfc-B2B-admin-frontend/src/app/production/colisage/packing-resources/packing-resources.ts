import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldIconComponent } from 'fold-ng';

import type { PackingResource } from '@lfd/contracts';

import { AwaitingBadge } from '../awaiting-badge/awaiting-badge';

/**
 * **La marchandise à répartir** — la colonne de droite, l'autre plateau de la
 * balance.
 *
 * 🔴 **Entrées seulement, et telle que servie.** L'écran recomptait `allocated`
 * et `remaining` à chaque coche ; il ne recompte plus rien (décidé le
 * 2026-09-14). Ce composant n'émet aucun geste et ne fait aucun calcul : il
 * affiche un reste, négatif s'il l'est, et deux signaux qui ne se confondent pas
 * — l'attente de la prod et le manque.
 *
 * Elle porte sur la JOURNÉE ENTIÈRE, prêtes comprises : ce qui est parti dans un
 * bac reste réparti. Le sélecteur de pile ne la touche pas.
 */
@Component({
  selector: 'app-packing-resources',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AwaitingBadge, FoldIconComponent],
  templateUrl: './packing-resources.html',
  styleUrl: './packing-resources.scss',
  host: { '[class.is-searching]': 'searching()' },
})
export class PackingResources {
  /** La marchandise de la journée, telle que servie. */
  readonly resources = input.required<readonly PackingResource[]>();

  /** Les SKU que la recherche surligne. */
  readonly hitSkus = input<ReadonlySet<string>>(new Set());

  /** Une recherche est-elle en cours ? Elle met en retrait ce qu'elle ne touche pas. */
  readonly searching = input(false);
}
