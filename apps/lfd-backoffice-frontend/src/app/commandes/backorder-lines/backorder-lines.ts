import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { AdminBackorderLine } from '@lfd/contracts';

import { backorderLineSentence } from '../backorder-words';

/**
 * **Les lignes d'un reliquat**, en lecture : « 3 × Croissant ». Ce qui reste
 * dû ne se modifie pas — on le transforme tel quel, ou on l'abandonne.
 */
@Component({
  selector: 'app-backorder-lines',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './backorder-lines.html',
  styleUrl: './backorder-lines.scss',
})
export class BackorderLines {
  readonly lines = input.required<readonly AdminBackorderLine[]>();

  protected readonly sentence = backorderLineSentence;
}
