import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { FoldEmptyStateComponent, FoldIconComponent } from 'fold-ng';

import { ClientChrome } from '../../client-chrome.service';
import { ClientLoyalty } from '../../client-loyalty.service';
import { ClientCopyService } from '../../copy/client-copy.service';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { LoyaltyCard } from '../loyalty-card/loyalty-card';

/**
 * **`/ma-fidelite`** — la fidélité de la PERSONNE (plan
 * `plan-points-de-fidelite.md` §12, E1.3 ; entrée à part décidée par Hugo le
 * 2026-09-27, parce que `/mon-compte` est le dossier de la société et reste
 * fermé à l'espace personnel).
 *
 * Particulier seulement : `personalWorkspaceGuard` renvoie un espace société
 * à son accueil (« on n'affiche pas de fidélité en pro, juste public » — Hugo,
 * 2026-09-27). Reste un cas, le particulier dont le programme est fermé et qui
 * arrive par un favori : la page le dit, sans promettre « bientôt » — le menu,
 * lui, n'y mène pas.
 */
@Component({
  selector: 'app-fidelite-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ClientBannerBlock,
    ClientBannerOutlet,
    FoldEmptyStateComponent,
    FoldIconComponent,
    LoyaltyCard,
  ],
  templateUrl: './fidelite-page.html',
  styleUrl: './fidelite-page.scss',
})
export class FidelitePage {
  private readonly loyalty = inject(ClientLoyalty);
  private readonly chrome = inject(ClientChrome);
  private readonly t = inject(ClientCopyService).t;
  protected readonly c = computed(() => this.t().loyalty);

  /** Fermée : la vue est lue, et le programme n'est pas ouvert à cet espace. */
  protected readonly closed = computed(() => this.loyalty.view()?.open === false);

  constructor() {
    effect(() => this.chrome.kicker.set(this.c().title));
    this.chrome.back.set(null);
    this.chrome.menu.set(true);
    this.chrome.bell.set(null);
    this.chrome.barOnDesktop.set(true);
  }
}
