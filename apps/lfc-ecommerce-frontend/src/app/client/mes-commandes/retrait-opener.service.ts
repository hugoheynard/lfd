import { inject, Injectable, Injector } from '@angular/core';
import { Router } from '@angular/router';
import { FoldPanelHostService } from 'fold-ng';

import { ClientCopyService, fill } from '../copy/client-copy.service';
import { NARROW_QUERY } from '../panel-side';
import { ClientOrderHistory } from './client-order-history.service';
import { RetraitPanel } from './retrait-panel/retrait-panel';
import { shareOrderQr } from './retrait-qr/qr-share';

/**
 * **Montrer le QR d'une commande** — la seule porte, pour l'accueil, la
 * confirmation et « Mes commandes » (Hugo, 2026-10-27 : « dans mes suivis de
 * bienvenue ça m'ouvre encore la version page »). En pile, la feuille du bas ;
 * au bureau, la page, qui est aussi l'adresse partagée.
 */
@Injectable({ providedIn: 'root' })
export class RetraitOpener {
  private readonly router = inject(Router);
  private readonly panels = inject(FoldPanelHostService);
  // Résolu à l'envoi : l'historique tire l'authentification, que l'ouverture
  // du panneau n'a pas à réveiller.
  private readonly injector = inject(Injector);
  private readonly t = inject(ClientCopyService).t;

  show(orderId: string): void {
    if (matchMedia(NARROW_QUERY).matches) {
      RetraitPanel.open(this.panels, orderId);
      return;
    }
    void this.router.navigate(['/mes-commandes/retrait', orderId]);
  }

  /**
   * **L'avion en papier d'une carte de suivi** (Hugo, 2026-10-27) : le même
   * envoi que le bouton du panneau, sans l'ouvrir.
   */
  async send(orderId: string): Promise<void> {
    const order = await this.injector.get(ClientOrderHistory).byId(orderId);
    await shareOrderQr(order, (ref) => fill(this.t().qr.shareTitle, { ref }));
  }
}
