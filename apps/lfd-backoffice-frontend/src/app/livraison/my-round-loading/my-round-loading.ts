import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FoldBackLinkComponent, FoldPageLayoutComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { LoadingGateway } from '../loading-gateway';
import { LoadingRound } from '../loading-round/loading-round';
import { MyDeliveryLoadingService } from '../my-delivery-loading.service';

/** « Ma tournée » : d'où l'on vient, et où l'on revient. */
export const MY_ROUND_PATH = '/coursier';

/**
 * **Charger MA tournée** (`parcours-du-livreur.md`, PL1) — la page
 * `/coursier/:roundId/chargement`, l'écran de chargement du dépôt
 * branché sur la porte du livreur.
 *
 * Le corps est {@link LoadingRound}, le même que celui du dépôt ; seules
 * changent la porte (routes `ma-tournee/:roundId/chargement…`, murées à SES
 * tournées) et le droit : `delivery_driving:read` pour voir — la route le
 * tient —, `:write` pour scanner et décharger. « Partir » n'est pas offert
 * ici : c'est « Commencer ma tournée », sur « Ma tournée ».
 *
 * Une adresse à elle : un rechargement rouvre le chargement, relu d'après
 * `:roundId`. Une tournée qui n'est pas au livreur, ou inconnue, est refusée
 * par sa porte, et le corps dit son état d'erreur habituel.
 */
@Component({
  selector: 'app-my-round-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBackLinkComponent, FoldPageLayoutComponent, LoadingRound, RouterLink],
  providers: [{ provide: LoadingGateway, useExisting: MyDeliveryLoadingService }],
  templateUrl: './my-round-loading.html',
  styleUrl: './my-round-loading.scss',
})
export class MyRoundLoading {
  private readonly permissions = inject(PermissionsStore);
  private readonly router = inject(Router);

  readonly roundId = input.required<string>();

  protected readonly backLink = MY_ROUND_PATH;

  protected readonly canWrite = computed(() => this.permissions.can('delivery_driving:write'));

  /** « Tout est chargé » : retour à « Ma tournée », qui relit la tournée. */
  protected back(): void {
    void this.router.navigateByUrl(MY_ROUND_PATH);
  }
}
