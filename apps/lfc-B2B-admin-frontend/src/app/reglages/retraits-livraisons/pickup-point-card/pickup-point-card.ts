import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { PickupAddressView } from '@lfd/contracts';
import { formatAdjustmentValue } from '@lfd/b2b-ui/pricing';
import {
  FoldBadgeComponent,
  FoldDropdownComponent,
  FoldDropdownItemComponent,
  FoldIconComponent,
  FoldInlineConfirmComponent,
  FoldPopoverTriggerDirective,
} from 'fold-ng';

import { openingRows } from '../pickup-opening.model';

/**
 * Un **point de retrait** dans la liste des Réglages : l'adresse, ses badges, ses
 * plages d'ouverture, et le menu d'actions.
 *
 * Carte **muette** : elle ne charge ni n'enregistre rien, elle n'ouvre pas le
 * panneau de saisie. La confirmation de suppression reste pilotée par la page
 * (`confirming`) et non par la carte — c'est ce qui garantit qu'une seule
 * confirmation est ouverte à la fois dans la liste.
 */
@Component({
  selector: 'app-pickup-point-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldIconComponent,
    FoldDropdownComponent,
    FoldDropdownItemComponent,
    FoldInlineConfirmComponent,
    FoldPopoverTriggerDirective,
  ],
  templateUrl: './pickup-point-card.html',
  styleUrl: './pickup-point-card.scss',
  host: { '[class.is-default]': 'point().isDefault' },
})
export class PickupPointCard {
  readonly point = input.required<PickupAddressView>();
  /** Faux sur le dernier point : on en garde toujours au moins un. */
  readonly canRemove = input(false);
  /** Vrai quand la page a ouvert la confirmation de suppression sur ce point. */
  readonly confirming = input(false);

  readonly setDefault = output<void>();
  readonly edit = output<void>();
  readonly askRemove = output<void>();
  readonly confirmRemove = output<void>();
  readonly cancelRemove = output<void>();

  /** Formate la remise du point pour l'affichage. */
  protected readonly fee = formatAdjustmentValue;
  /** Les plages d'ouverture déclarées, lisibles. Vide = aucune heure opposée. */
  protected readonly hours = openingRows;
}
