import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ClientCopyService } from '../../../client/copy/client-copy.service';

/**
 * Le filet qui sépare la voie principale de la porte de secours.
 *
 * Son mot se fournit : « ou » entre deux portes équivalentes, « ou par e-mail »
 * quand ce qui suit n'est pas une autre façon de faire la même chose mais
 * l'autre moyen d'entrer. Par défaut, le simple « ou ».
 */
@Component({
  selector: 'app-rule-ou',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './rule-ou.html',
  styleUrl: './rule-ou.scss',
})
export class RuleOu {
  /** Le mot du filet. Vide : celui du dictionnaire. */
  readonly label = input('');

  private readonly t = inject(ClientCopyService).t;

  protected readonly word = computed(() => this.label() || this.t().doors.or);
}
