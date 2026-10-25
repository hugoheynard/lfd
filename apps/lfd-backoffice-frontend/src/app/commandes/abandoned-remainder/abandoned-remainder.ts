import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { PackingAbandonedLine } from '@lfd/contracts';

import { abandonedSentence } from '../shortfall-remainder';

/**
 * **« Reste abandonné : 2 Croissant »**, une ligne par article (Hugo,
 * 2026-10-25) : la commande décidée continue de MONTRER ce qui n'est pas
 * parti — fiche commande, poste de colisage, carte de la Supervision. Rien
 * quand la liste est vide.
 */
@Component({
  selector: 'app-abandoned-remainder',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './abandoned-remainder.html',
  styleUrl: './abandoned-remainder.scss',
})
export class AbandonedRemainder {
  readonly lines = input.required<readonly PackingAbandonedLine[]>();

  protected readonly sentence = abandonedSentence;
}
