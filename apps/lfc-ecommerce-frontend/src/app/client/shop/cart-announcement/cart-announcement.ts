import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { CartAnnouncer } from '../cart-announcer.service';

/**
 * **La région d'état du panier** (RGAA 7.5, lot A2) — invisible, polie : elle
 * parle après ce que le lecteur d'écran est en train de dire.
 *
 * Elle est posée par chaque écran qui montre des tuiles (la boutique,
 * l'accueil), une fois, et AVANT le premier geste : une région qui apparaît en
 * même temps que son texte n'est pas annoncée.
 */
@Component({
  selector: 'app-cart-announcement',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './cart-announcement.html',
  styleUrl: './cart-announcement.scss',
})
export class CartAnnouncement {
  protected readonly message = inject(CartAnnouncer).message;
}
