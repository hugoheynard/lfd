import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { FoldCardComponent, FoldElementTitleComponent, FoldScrollRegionDirective } from 'fold-ng';

/** Un jour de l'aperçu : sa date locale et les heures qu'elle ouvre. */
export interface PreviewDay {
  readonly day: string;
  readonly times: readonly string[];
}

/**
 * Carte **Aperçu** : ce que le client verra, sur 14 jours.
 *
 * Purement présentationnelle. Les créneaux viennent de la **même route** que
 * celle du client — c'est ce qui garantit qu'aucun créneau montré ici ne serait
 * refusé là-bas. Elle est rafraîchie par le parent **après enregistrement**
 * seulement : un aperçu qui refléterait un brouillon non enregistré serait un
 * mensonge de plus, pas une aide.
 */
@Component({
  selector: 'app-slots-preview-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCardComponent, FoldElementTitleComponent, FoldScrollRegionDirective],
  templateUrl: './slots-preview-card.html',
  styleUrl: './slots-preview-card.scss',
})
export class SlotsPreviewCard {
  readonly days = input.required<readonly PreviewDay[]>();
}
