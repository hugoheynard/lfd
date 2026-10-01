import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DeliveryLoadingRoundView } from '@lfd/contracts';
import { FoldBackLinkComponent, FoldPageLayoutComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { DeliveryLoadingService } from '../delivery-loading.service';
import { roundLabel, serviceDayLabel } from '../delivery-rounds';
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
  imports: [FoldBackLinkComponent, FoldPageLayoutComponent, LoadingRound, RouterLink],
  templateUrl: './loading-round-page.html',
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

  protected readonly title = computed(() => {
    const view = this.view();
    return view === null ? 'Chargement' : `Chargement · ${roundLabel(view)}`;
  });

  protected readonly dayLabel = serviceDayLabel;
}
