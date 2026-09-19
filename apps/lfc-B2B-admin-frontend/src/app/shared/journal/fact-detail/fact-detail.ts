import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldDisclosureComponent, FoldFieldComponent, FoldFieldListComponent } from 'fold-ng';

import type { DetailRow } from '../detail-rows';

/**
 * **Le détail d'un fait** : tout ce que la phrase n'a pas dit, clé par clé
 * (D4 du plan des phrases du journal).
 *
 * Replié par défaut — la phrase suffit à parcourir un journal — et ouvert d'un
 * geste : le résumé de `fold-disclosure` est un bouton, donc atteignable au
 * clavier et annoncé avec son état. Rien quand il n'y a rien à ajouter.
 */
@Component({
  selector: 'app-fact-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldDisclosureComponent, FoldFieldComponent, FoldFieldListComponent],
  templateUrl: './fact-detail.html',
})
export class FactDetail {
  readonly rows = input.required<readonly DetailRow[]>();
}
