import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { DeliveryLoadingRoundView } from '@lfd/contracts';
import { FoldBreadcrumbComponent, type FoldBreadcrumbItem, FoldPageLayoutComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { DeliveryLoadingService } from '../delivery-loading.service';
import { roundLabel } from '../delivery-rounds';
import { type LoadingDeparture, LoadingRound } from '../loading-round/loading-round';

/**
 * **Charger UN véhicule, vu du dépôt** (`/livraison/chargement/:roundId`,
 * lot 4, L4-C2), sous `delivery_loading`.
 *
 * Le corps est {@link LoadingRound}, partagé avec « Ma tournée » (PL1) ; la
 * page n'y ajoute que ce qui est propre au dépôt : son droit, son retour, et
 * « Partir » par la route des tournées. Les routes du chargement sont celles
 * du dépôt, la porte par défaut de `LoadingGateway`.
 */
@Component({
  selector: 'app-loading-round-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBreadcrumbComponent, FoldPageLayoutComponent, LoadingRound],
  templateUrl: './loading-round-page.html',
  styleUrl: './loading-round-page.scss',
})
export class LoadingRoundPage {
  private readonly service = inject(DeliveryLoadingService);
  private readonly permissions = inject(PermissionsStore);

  readonly roundId = input.required<string>();

  /** La dernière vue lue par le corps : de quoi titrer la page. */
  protected readonly view = signal<DeliveryLoadingRoundView | null>(null);

  protected readonly canWrite = computed(() => this.permissions.can('delivery_loading:write'));
  protected readonly departure: LoadingDeparture = (roundId, version) =>
    this.service.depart(roundId, version);

  /**
   * Le bandeau sombre : « Livraison / Chargement / Tournée · Kangoo ». L'heure
   * et le lieu de départ ne sont pas servis par la vue du chargement : ils ne
   * s'inventent pas ici.
   */
  protected readonly crumbs = computed((): readonly FoldBreadcrumbItem[] => {
    const view = this.view();
    return [
      { label: 'Livraison', routerLink: '/livraison' },
      { label: 'Chargement', routerLink: '/livraison/chargement' },
      { label: view === null ? 'Tournée' : `Tournée · ${roundLabel(view)}` },
    ];
  });
}
