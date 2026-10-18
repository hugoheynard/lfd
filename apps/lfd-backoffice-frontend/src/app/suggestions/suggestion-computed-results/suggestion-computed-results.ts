import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { ComputedSuggestionResultRow } from '@lfd/contracts';
import { FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';

import { addRateLabel, COMPUTED_RESULT_LABELS, revenueLabel } from '../suggestion-results';

/**
 * **Les chiffres du calculé** (RS6) — « souvent pris avec » et « vos
 * habituels », sous les règles de l'équipe. Les mêmes six chiffres qu'une
 * règle ; commandées et CA sortent du MÊME partage que les règles, côté
 * serveur, si bien qu'une pièce n'est comptée qu'une fois.
 */
@Component({
  selector: 'app-suggestion-computed-results',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent],
  templateUrl: './suggestion-computed-results.html',
  styleUrl: './suggestion-computed-results.scss',
})
export class SuggestionComputedResults {
  readonly rows = input.required<readonly ComputedSuggestionResultRow[]>();

  protected readonly labels = COMPUTED_RESULT_LABELS;
  protected readonly addRateLabel = addRateLabel;
  protected readonly revenueLabel = revenueLabel;
}
