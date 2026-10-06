import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { DeliveryPlacementSuggestionView } from '@lfd/contracts';
import { FoldButtonComponent } from 'fold-ng';

import { placementSuggestionWords } from '../placement-suggestion-words';

/**
 * **La place suggérée** d'une commande à répartir (CA7,
 * `composition-automatique.md` §5) : où l'insérer dans les tournées
 * enregistrées, et « Placer ici », qui remonte à la page — elle fait
 * l'affectation, au rang suggéré, sous la version lue avec la suggestion.
 * Sans place, la raison seule.
 */
@Component({
  selector: 'app-placement-suggestion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent],
  templateUrl: './placement-suggestion.html',
  styleUrl: './placement-suggestion.scss',
})
export class PlacementSuggestion {
  readonly suggestion = input.required<DeliveryPlacementSuggestionView>();
  /** Le droit d'écrire, et aucune écriture en vol. */
  readonly canPlace = input(false);

  readonly place = output();

  protected readonly words = computed(() => placementSuggestionWords(this.suggestion()));
  protected readonly suggested = computed(() => this.suggestion().status === 'suggested');
}
