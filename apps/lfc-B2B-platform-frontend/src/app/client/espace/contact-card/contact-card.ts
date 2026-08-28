import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { ClientCopyService } from '../../copy/client-copy.service';

/**
 * « On répond » — la carte de contact, bloc de PREMIER niveau.
 *
 * Jamais un enfant de « Vos habitudes » : une carte de support téléphonique
 * n'est pas une habitude. Et pas de photo — à 274 px de large, une image impose
 * une hauteur qui déséquilibre la ligne. Ce qui rend le contact humain, ce sont
 * les PRÉNOMS de l'équipe, pas un portrait.
 *
 * Elle est crème sur le fond crème, donc bordée et ombrée : c'est ce qui lui
 * permet d'exister à côté du puits sombre.
 */
@Component({
  selector: 'app-contact-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './contact-card.html',
  styleUrl: './contact-card.scss',
})
export class ContactCard {
  protected readonly t = inject(ClientCopyService).t;
}
