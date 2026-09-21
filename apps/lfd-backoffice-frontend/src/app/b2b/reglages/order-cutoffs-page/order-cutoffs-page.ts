import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { PickupAddressView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { CutoffsSection } from '../cutoffs-section/cutoffs-section';
import { PickupAddressesService } from '../pickup-addresses.service';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Heures limites de commande** — « E-commerce LFC → Réglages ». La section
 * est celle de l'ancien onglet « Retraits & livraisons », telle quelle.
 *
 * La page ne lit que les points de retrait : le panneau d'une règle en a besoin
 * pour sa portée. Ils étaient fournis par la page des points quand les deux
 * vivaient ensemble ; séparées, celle-ci les lit elle-même.
 */
@Component({
  selector: 'app-order-cutoffs-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CutoffsSection,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './order-cutoffs-page.html',
})
export class OrderCutoffsPage {
  private readonly pickups = inject(PickupAddressesService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly points = signal<readonly PickupAddressView[]>([]);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.points.set(await this.pickups.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
