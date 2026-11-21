import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { DriftBanner } from '../drift-banner/drift-banner';
import { WorkshopDayReader } from '../state/workshop-day.reader';
import { WorkshopGestures } from '../state/workshop-gestures';
import { WorkshopQueueReplay } from '../outbox/workshop-queue-replay';

/**
 * **Les bandeaux de la fiche d'atelier** : ce qui ne va pas (rayons ou postes
 * illisibles, relecture en échec, geste refusé, retirage manqué), ce qui
 * attend (gestes gardés sans réseau) et ce qui vient de changer (journée
 * passée, tirage périmé). Un échec partiel laisse la fiche à l'écran et se dit.
 *
 * Il lit l'état de la fiche par les services qu'elle fournit ; il ne décide
 * rien. L'hôte ne dessine rien : chaque bandeau prend sa place dans la
 * colonne de la bande de tête, et son écart vient du `gap` de celle-ci.
 */
@Component({
  selector: 'app-workshop-notices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DriftBanner, FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './workshop-notices.html',
  styleUrl: './workshop-notices.scss',
})
export class WorkshopNotices {
  protected readonly day = inject(WorkshopDayReader);
  protected readonly gestures = inject(WorkshopGestures);
  protected readonly queue = inject(WorkshopQueueReplay);

  /** « samedi 16 août » quand le lien suivi vise une autre journée que celle lue. */
  readonly linkedElsewhere = input<string | null>(null);
  /** Téléphone : le bandeau de tirage se resserre. */
  readonly compact = input(false);
}
