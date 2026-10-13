import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { OrderCutoffView, SiteView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../../../auth/permissions.store';
import {
  cutoffSentence,
  graceSentence,
  weekdayLabel,
} from '../../../../b2b/reglages/cutoffs-section/cutoff-format';
import {
  CutoffPanel,
  type CutoffPanelData,
} from '../../../../b2b/reglages/cutoffs-section/cutoff-panel/cutoff-panel';
import { OrderCutoffsService } from '../../../../b2b/reglages/order-cutoffs.service';
import { NotifyService } from '../../../../notify.service';

type LoadState = 'loading' | 'ready' | 'forbidden' | 'error';

const FORBIDDEN = 403;

/**
 * **Les heures limites de commande de CE site** — sous-carte de « Paramétrage
 * du retrait » (Hugo, 2026-10-13). Elle lit et écrit par la route existante
 * (`admin/order-cutoffs`), sous le droit `b2b_settings` : l'écran des sites
 * est sous `lfc_site_settings`, et aucun droit n'a été déplacé. Sans
 * `b2b_settings:read`, la sous-carte le dit au lieu de se taire.
 *
 * Elle montre les règles de ce site, et la règle par défaut qui s'applique
 * quand aucune ne vise un jour — celle-ci se règle sur l'écran des heures
 * limites, qui reste l'endroit de la règle commune.
 */
@Component({
  selector: 'app-site-cutoffs-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
    FoldPageSectionComponent,
    RouterLink,
  ],
  templateUrl: './site-cutoffs-card.html',
  styleUrl: './site-cutoffs-card.scss',
})
export class SiteCutoffsCard {
  private readonly api = inject(OrderCutoffsService);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  readonly site = input.required<SiteView>();
  readonly readOnly = input(false);

  protected readonly canWrite = computed(
    () => !this.readOnly() && this.permissions.can('b2b_settings:write'),
  );
  protected readonly state = signal<LoadState>('loading');
  private readonly rules = signal<readonly OrderCutoffView[]>([]);
  protected readonly pendingRemoval = signal<string | null>(null);

  /** Les règles de ce site, dans l'ordre où elles s'appliquent. */
  protected readonly own = computed(() =>
    this.rules().filter((rule) => rule.pickupAddressId === this.site().id),
  );
  /** Les règles communes, qui couvrent ce qu'aucune règle du site ne vise. */
  protected readonly defaults = computed(() =>
    this.rules().filter((rule) => rule.pickupAddressId === null),
  );

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.rules.set(await this.api.list());
      this.state.set('ready');
    } catch (error) {
      const forbidden = error instanceof HttpErrorResponse && error.status === FORBIDDEN;
      this.state.set(forbidden ? 'forbidden' : 'error');
    }
  }

  protected add(): void {
    this.open(null);
  }

  protected edit(rule: OrderCutoffView): void {
    this.open(rule);
  }

  protected async remove(rule: OrderCutoffView): Promise<void> {
    this.pendingRemoval.set(null);
    try {
      await this.api.remove(rule.id);
      this.notify.success('Heure limite supprimée.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected day(rule: OrderCutoffView): string {
    return weekdayLabel(rule.weekday);
  }

  protected sentence(rule: OrderCutoffView): string {
    return cutoffSentence(rule);
  }

  protected grace(rule: OrderCutoffView): string | null {
    return graceSentence(rule);
  }

  private open(rule: OrderCutoffView | null): void {
    const site = this.site();
    const data: CutoffPanelData = { rule, points: [site], lockedPointId: site.id };
    const ref = this.panelHost.open(CutoffPanel, { data });
    void ref.closed.then((saved) => {
      if (saved === true) {
        void this.load();
      }
    });
  }
}
