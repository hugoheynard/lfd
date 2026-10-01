import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FoldButtonComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { LoadingGateway } from '../loading-gateway';
import { LoadingRound } from '../loading-round/loading-round';
import { MyDeliveryLoadingService } from '../my-delivery-loading.service';

/**
 * **Charger MA tournée** (`parcours-du-livreur.md`, PL1) — l'écran de
 * chargement du dépôt, branché sur la porte du livreur.
 *
 * Le corps est {@link LoadingRound}, le même que celui du dépôt ; seules
 * changent la porte (routes `ma-tournee/:roundId/chargement…`, murées à SES
 * tournées) et le droit : `delivery_driving:read` pour voir — la route de la
 * page le tient —, `:write` pour scanner et décharger. « Partir » n'est pas
 * offert ici : c'est « Commencer ma tournée », sur la page.
 */
@Component({
  selector: 'app-my-round-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, LoadingRound],
  providers: [{ provide: LoadingGateway, useExisting: MyDeliveryLoadingService }],
  templateUrl: './my-round-loading.html',
  styleUrl: './my-round-loading.scss',
})
export class MyRoundLoading {
  private readonly permissions = inject(PermissionsStore);

  readonly roundId = input.required<string>();

  /** Retour à la tournée : la page la relit (des bacs ont pu changer). */
  readonly closed = output();

  protected readonly canWrite = computed(() => this.permissions.can('delivery_driving:write'));
}
