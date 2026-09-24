import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { OperationView } from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { audienceLabel, badgeLabel, badgeOf, badgeVariant } from '../operation-format';
import { formatInstant, pickupPhrase } from '../operation-schedule';
import { OperationsService } from '../operations.service';
import { PrepareOperationPanel } from '../prepare-operation-panel/prepare-operation-panel';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **Les opérations datées** — Noël, Pâques, la galette : ce qu'on prépare au
 * référentiel, et où chacune en est.
 *
 * L'état vient du serveur, calculé à SON horloge (D2) ; l'écran ne fait que le
 * dire. Les dates se lisent en heure de Paris.
 */
@Component({
  selector: 'app-operations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    RouterLink,
  ],
  templateUrl: './operations-page.html',
  styleUrl: './operations-page.scss',
})
export class OperationsPage {
  private readonly api = inject(OperationsService);
  private readonly panels = inject(FoldPanelHostService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  protected readonly operations = signal<readonly OperationView[]>([]);

  protected readonly badgeLabel = (view: OperationView): string => badgeLabel(badgeOf(view));
  protected readonly badgeVariant = (view: OperationView) => badgeVariant(badgeOf(view));
  protected readonly audience = (view: OperationView): string => audienceLabel(view.audience);
  protected readonly announce = (view: OperationView): string => formatInstant(view.announceFrom);
  protected readonly until = (view: OperationView): string => formatInstant(view.orderUntil);
  protected readonly pickup = (view: OperationView): string =>
    pickupPhrase(view.pickupFrom, view.pickupUntil);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.operations.set(await this.api.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Créée, l'opération s'ouvre sur sa page : l'accroche, l'image et la sélection s'y règlent. */
  protected prepare(): void {
    void this.panels.open<string>(PrepareOperationPanel).closed.then((key) => {
      if (key !== undefined) {
        void this.router.navigate(['/pim', 'operations', key]);
      }
    });
  }
}
