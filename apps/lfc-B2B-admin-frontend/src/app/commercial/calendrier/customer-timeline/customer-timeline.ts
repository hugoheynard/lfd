import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldTimelineComponent,
} from 'fold-ng';
import type { AppointmentView, CustomerTimelineEntry } from '@lfd/contracts';

import { timelineNodes } from './timeline-nodes';

/**
 * **Historique d'interaction** du compte — ce qui s'est passé, dans l'ordre.
 *
 * Il vit dans le rail **collant** de la fiche : on le garde sous les yeux
 * pendant qu'on descend le dossier, parce que c'est lui qui répond aux questions
 * qu'on se pose en lisant les chiffres (« depuis quand ? », « qui a annulé ? »).
 *
 * Le rendez-vous **qu'on est en train de traiter** ouvre la liste, marqué « en
 * cours » : c'est le point de repère à partir duquel tout le reste se lit, et il
 * n'est pas encore dans le journal comme un fait accompli.
 *
 * Le journal fournit le reste, filtré au **commercial** : chaque rendez-vous
 * abouti porte ce qu'il a produit — compte activé, commande, panier récurrent.
 * C'est ce qui distingue un historique commercial d'un flux d'événements.
 */
@Component({
  selector: 'app-customer-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldTimelineComponent,
    FoldCalloutComponent,
  ],
  templateUrl: './customer-timeline.html',
  styleUrl: './customer-timeline.scss',
})
export class CustomerTimeline {
  readonly entries = input.required<readonly CustomerTimelineEntry[]>();
  /** Le rendez-vous en cours de traitement — la tête de liste. */
  readonly current = input<AppointmentView | null>(null);

  protected readonly nodes = computed(() => timelineNodes(this.entries()));
}
