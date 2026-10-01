import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DeliveryIncidentView } from '@lfd/contracts';
import { FoldCardComponent, FoldElementTitleComponent } from 'fold-ng';

import { incidentSubtitleOf, incidentTitleOf } from '../delivery-incidents';
import { IncidentPhoto, type IncidentPhotoLoader } from '../incident-photo/incident-photo';

/**
 * **Des signalements, l'un sous l'autre** — famille et motif, quand et par
 * qui, la note, la photo à la demande (`plan-a-la-porte.md`, § 3). Le même
 * rendu pour le livreur et pour l'admin ; seule la route de la photo change.
 */
@Component({
  selector: 'app-incident-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent, IncidentPhoto],
  templateUrl: './incident-list.html',
  styleUrl: './incident-list.scss',
})
export class IncidentList {
  readonly incidents = input.required<readonly DeliveryIncidentView[]>();
  readonly loadPhoto = input.required<IncidentPhotoLoader>();

  protected readonly titleOf = incidentTitleOf;
  protected readonly subtitleOf = incidentSubtitleOf;
}
