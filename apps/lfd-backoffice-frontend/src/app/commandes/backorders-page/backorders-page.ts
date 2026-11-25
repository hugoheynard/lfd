import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { AdminBackorderView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { serverMessageOf } from '../../production/server-message';
import { BackorderLines } from '../backorder-lines/backorder-lines';
import { backorderAgeOf } from '../backorder-words';
import { AdminBackordersService } from '../backorders.service';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **« Reliquats à traiter »** (`documentation/commandes/reliquat/reliquat.md`, § 6.5) : les
 * reliquats ouverts, du plus ancien au plus récent — la société, la commande
 * d'origine, ce qui reste dû, et depuis quand. Les gestes (transformer,
 * abandonner) vivent sur la fiche de la commande d'origine, où l'on voit ce
 * qui est parti.
 */
@Component({
  selector: 'app-backorders-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    BackorderLines,
    FoldButtonComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    RouterLink,
  ],
  templateUrl: './backorders-page.html',
  styleUrl: './backorders-page.scss',
})
export class BackordersPage {
  private readonly api = inject(AdminBackordersService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly loadError = signal<string | null>(null);
  protected readonly backorders = signal<readonly AdminBackorderView[]>([]);
  /** L'instant de la lecture : l'âge se compte depuis lui, pas à chaque rendu. */
  private readonly readAt = signal(new Date());

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    this.loadError.set(null);
    try {
      this.backorders.set(await this.api.list('open'));
      this.readAt.set(new Date());
      this.state.set('ready');
    } catch (error) {
      this.loadError.set(serverMessageOf(error));
      this.state.set('error');
    }
  }

  protected ageOf(backorder: AdminBackorderView): string {
    return backorderAgeOf(backorder.createdAt, this.readAt());
  }
}
