import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';

import { ClientCopyService } from '../copy/client-copy.service';

/**
 * La porte traiteur : séminaire, anniversaire, sortie de club.
 *
 * Elle vit sur l'accueil parce que c'est la demande qu'un visiteur ne pense pas
 * à formuler — il vient chercher du pain et repart avec un devis. Empilée sur le
 * téléphone (photo au-dessus), couchée au-delà du pli (bande de photo à gauche).
 */
@Component({
  selector: 'app-event-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './event-card.html',
  styleUrl: './event-card.scss',
})
export class EventCard {
  readonly opened = output<void>();

  protected readonly t = inject(ClientCopyService).t;
}
