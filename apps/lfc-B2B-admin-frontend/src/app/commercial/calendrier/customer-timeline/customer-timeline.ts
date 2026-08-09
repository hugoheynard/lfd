import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FoldCardComponent, FoldElementTitleComponent, FoldTimelineComponent } from 'fold-ng';
import type { CustomerTimelineEntry } from '@lfd/contracts';

import { nodesOf, timelineRows, type TimelineRow } from './timeline-nodes';

/**
 * **Historique d'interaction** du compte — ce qui s'est passé, dans l'ordre.
 *
 * Il vit dans le rail **collant** de la fiche : on le garde sous les yeux
 * pendant qu'on descend le dossier, parce que c'est lui qui répond aux questions
 * qu'on se pose en lisant les chiffres (« depuis quand ? », « qui a annulé ? »).
 *
 * Il vient juste sous la carte du rendez-vous en cours, qui tient le rail : le
 * repère d'abord, ce qui l'a précédé ensuite.
 *
 * Le journal le fournit, filtré au **commercial** : chaque rendez-vous
 * abouti porte ce qu'il a produit — compte activé, commande, panier récurrent.
 * C'est ce qui distingue un historique commercial d'un flux d'événements.
 */
@Component({
  selector: 'app-customer-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent, FoldTimelineComponent],
  templateUrl: './customer-timeline.html',
  styleUrl: './customer-timeline.scss',
})
export class CustomerTimeline {
  readonly entries = input.required<readonly CustomerTimelineEntry[]>();

  protected readonly rows = computed(() => timelineRows(this.entries()));
  protected readonly nodes = computed(() => nodesOf(this.rows()));

  /**
   * Les lignes retrouvables **par clé**. `fold-timeline` ne passe au template
   * projeté que son propre nœud : c'est par sa clé qu'on récupère le détail
   * (acteur, conséquence) sans le compresser dans le libellé.
   */
  protected readonly byKey = computed(() => {
    const map = new Map<string, TimelineRow>();
    for (const row of this.rows()) {
      map.set(row.key, row);
    }
    return map;
  });
}
