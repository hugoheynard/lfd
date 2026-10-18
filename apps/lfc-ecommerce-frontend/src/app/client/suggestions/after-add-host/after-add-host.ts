import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  untracked,
  viewChild,
  ViewContainerRef,
} from '@angular/core';

import { CartEntries } from '../../cart/cart-entries';

/**
 * **L'hôte de l'après-ajout** (RS7) : il ne monte le retour « Ajouté ! » qu'à
 * la première entrée au panier, par un import à la demande. Le paquet initial
 * de la boutique est près de son plafond : ni le retour, ni sa carte, ni sa
 * requête n'y entrent. Un `@defer` aurait fait le même travail en y ajoutant
 * son moteur (~8 kB mesurés le 2026-10-18), plus lourd que ce qu'il diffère.
 *
 * Le service du retour répond à l'entrée qui l'a fait monter : elle n'est pas
 * perdue.
 */
@Component({
  selector: 'app-after-add-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './after-add-host.html',
})
export class AfterAddHost {
  private readonly slot = viewChild.required('slot', { read: ViewContainerRef });
  private readonly entries = inject(CartEntries);
  private mounting = false;

  constructor() {
    effect(() => {
      if (this.entries.latest() !== null && !this.mounting) {
        this.mounting = true;
        untracked(() => void this.mount());
      }
    });
  }

  private async mount(): Promise<void> {
    const { AfterAddToast } = await import('../after-add-toast/after-add-toast');
    this.slot().createComponent(AfterAddToast);
  }
}
