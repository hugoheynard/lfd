import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { PickupAddressView } from '@lfd/contracts';
import { FoldIconComponent } from 'fold-ng';

import type { PickupOffer } from '../../../../client/shop/pickup-discount';

/**
 * Une boutique de retrait, en carte carrée — posée à côté de « Je passe la
 * prendre » quand la livraison n'est pas proposée à la clientèle de l'écran.
 *
 * Sans livraison, la seule question qui reste est « où » : la moitié d'écran
 * qu'occupait le coursier y répond directement, une carte par point, au lieu de
 * rester vide ou d'étirer le retrait sur toute la largeur (Hugo, 2026-09-15).
 *
 * La carte ne décide rien : elle dit le lieu et ce qu'il promet, et remonte le
 * geste. C'est l'écran qui ouvre le dialogue, déjà placé sur l'heure.
 */
@Component({
  selector: 'app-pickup-point-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldIconComponent],
  templateUrl: './pickup-point-card.html',
  styleUrl: './pickup-point-card.scss',
})
export class PickupPointCard {
  readonly point = input.required<PickupAddressView>();

  /** « votre habitude » sur le point par défaut ; vide ailleurs. */
  readonly tag = input<string>('');

  readonly offer = input.required<PickupOffer>();

  /** L'action, nommée au bureau — le téléphone n'a que le chevron. */
  readonly cta = input.required<string>();

  readonly chosen = output<void>();
}
