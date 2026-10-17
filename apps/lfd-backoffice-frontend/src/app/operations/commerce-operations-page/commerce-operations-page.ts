import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import type { CommerceOperationView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { formatInstant, pickupPhrase } from '../operation-schedule';
import {
  audienceLabel,
  badgeLabel,
  badgeOf,
  badgeVariant,
  shopDisplayPhrase,
  splitArchived,
} from '../commerce-operation-format';
import { CommerceOperationsService } from '../commerce-operations.service';
import { OperationImage } from '../operation-image/operation-image';
import { PrepareCommerceOperationPanel } from '../prepare-commerce-operation-panel/prepare-commerce-operation-panel';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **Les opérations, tenues au commerce** — Noël, Pâques, la galette : où
 * chacune en est, et ce que le client en voit
 * (`plan-l-operation-passe-au-commerce.md`, lot 3).
 *
 * « Préparer une opération » (lot 3 bis) n'est offert qu'à
 * `lfc_operations:write`. La carte de la reprise depuis le référentiel est
 * partie en X4 (`plan-sans-interrupteurs.md`) : elle n'avait rien à reprendre.
 */
@Component({
  selector: 'app-commerce-operations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    NgTemplateOutlet,
    OperationImage,
    RouterLink,
  ],
  templateUrl: './commerce-operations-page.html',
  styleUrl: './commerce-operations-page.scss',
})
export class CommerceOperationsPage {
  private readonly api = inject(CommerceOperationsService);
  private readonly permissions = inject(PermissionsStore);
  private readonly panels = inject(FoldPanelHostService);
  private readonly router = inject(Router);

  protected readonly state = signal<LoadState>('loading');
  private readonly operations = signal<readonly CommerceOperationView[]>([]);
  private readonly split = computed(() => splitArchived(this.operations()));
  protected readonly live = computed(() => this.split().live);
  protected readonly archived = computed(() => this.split().archived);

  /** La préparation écrit : elle n'est montrée qu'à qui peut écrire. */
  protected readonly canWrite = computed(() => this.permissions.can('lfc_operations:write'));

  protected readonly badgeLabel = (view: CommerceOperationView): string =>
    badgeLabel(badgeOf(view));
  protected readonly badgeVariant = (view: CommerceOperationView) => badgeVariant(badgeOf(view));
  protected readonly shopDisplay = (view: CommerceOperationView): string =>
    shopDisplayPhrase(view.shopDisplay);
  protected readonly audience = (view: CommerceOperationView): string =>
    audienceLabel(view.audience);
  protected readonly announce = (view: CommerceOperationView): string =>
    formatInstant(view.announceFrom);
  protected readonly until = (view: CommerceOperationView): string =>
    formatInstant(view.orderUntil);
  protected readonly pickup = (view: CommerceOperationView): string =>
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

  /** Créée, l'opération s'ouvre sur sa page : le chapeau, l'image et la sélection s'y règlent. */
  protected prepare(): void {
    void this.panels.open<string>(PrepareCommerceOperationPanel).closed.then((key) => {
      if (key !== undefined) {
        void this.router.navigate(['/operations', key]);
      }
    });
  }
}
