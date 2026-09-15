import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { PickupAddressView } from '@lfd/contracts';
import { FoldIconComponent } from 'fold-ng';

import type { PickupOffer } from '../../../../client/shop/pickup-discount';

/**
 * Une boutique de retrait, en petite carte beige — posée sur la photo de « Je
 * passe la prendre » quand la livraison n'est pas proposée à la clientèle de
 * l'écran (sous elle en pile, où la photo n'est qu'un bandeau).
 *
 * Sans livraison, la seule question qui reste est « où » : le retrait reprend
 * toute la largeur, et les boutiques y répondent directement, une carte par
 * point (Hugo, 2026-09-15 — une première version en carrés d'encre prenait la
 * moitié du coursier, et disputait la place au retrait).
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

  readonly chosen = output<void>();
}
