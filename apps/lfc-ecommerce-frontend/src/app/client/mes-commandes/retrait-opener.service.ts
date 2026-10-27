import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { FoldPanelHostService } from 'fold-ng';

import { NARROW_QUERY } from '../panel-side';
import { RetraitPanel } from './retrait-panel/retrait-panel';

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

  show(orderId: string): void {
    if (matchMedia(NARROW_QUERY).matches) {
      RetraitPanel.open(this.panels, orderId);
      return;
    }
    void this.router.navigate(['/mes-commandes/retrait', orderId]);
  }
}
