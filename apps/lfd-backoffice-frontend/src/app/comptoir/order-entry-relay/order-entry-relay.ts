import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FoldLoadingStateComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { orderEntryParams } from '../../commandes/nouvelle-commande/order-entry-return';
import { HandoverQueueStore } from '../../handover-shop/handover-queue.store';

/**
 * **L'onglet « Nouvelle commande » du comptoir**, qui n'est plus qu'un relais :
 * la saisie est la page à part `/nouvelle-commande`. Monté dans le comptoir,
 * il lit le point de retrait ouvert — que seule la bande du comptoir connaît —
 * et l'emporte dans l'adresse avec l'origine, pour que le « Retrait immédiat »
 * reste proposé et que « Terminer » ramène ici.
 *
 * Le point ne se lit que sous le droit du retrait (comme la bande) ; sans lui,
 * ou une fois les points lus sans point ouvert, on part sans.
 */
@Component({
  selector: 'app-order-entry-relay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldLoadingStateComponent],
  template: '<fold-loading message="Ouverture de la saisie…" />',
})
export class OrderEntryRelay {
  private readonly router = inject(Router);
  private readonly queue = inject(PermissionsStore).can('handover_counter:read')
    ? inject(HandoverQueueStore, { optional: true })
    : null;
  private left = false;

  constructor() {
    effect(() => {
      if (this.left) return;
      if (this.queue !== null && !this.queue.placesLoaded()) return;
      this.left = true;
      const point = this.queue?.activePlace()?.id ?? null;
      void this.router.navigate(['/nouvelle-commande'], {
        queryParams: orderEntryParams('/comptoir', point),
        replaceUrl: true,
      });
    });
  }
}
