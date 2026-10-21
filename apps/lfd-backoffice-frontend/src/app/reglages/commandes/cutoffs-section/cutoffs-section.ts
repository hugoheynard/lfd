import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { OrderCutoffView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { OrderCutoffsService } from '../order-cutoffs.service';
import { CutoffPanel, type CutoffPanelData } from './cutoff-panel/cutoff-panel';
import { cutoffSentence, graceSentence } from './cutoff-format';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **L'heure limite générale** — Réglages › Commandes › Heure limite de
 * commande. Pour tout le monde, et elle déclenche l'arrêt du plan de
 * production pour le lendemain (Hugo, 2026-10-21 —
 * `documentation/limites-de-commande/plan-une-seule-heure.md` §5).
 *
 * Une seule règle : la générale (décision de Hugo du 2026-10-21,
 * `documentation/limites-de-commande/schema-des-reglages.md` §4, point 4). Les
 * règles par point de retrait ou par jour sont retirées — le serveur les
 * refuse et n'en sert plus —, et l'écran ne les liste plus. La générale ne se
 * supprime pas, et ne s'éteint plus : l'interrupteur est retiré le 2026-10-21.
 *
 * Le serveur ouvre la lecture sous `lfc_order_settings:read` et l'écriture
 * sous `lfc_order_settings:write` (plan, §3.4) : sans ce dernier, la règle se
 * lit et aucun geste ne promet un refus.

 */
@Component({
  selector: 'app-cutoffs-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './cutoffs-section.html',
  styleUrl: './cutoffs-section.scss',
})
export class CutoffsSection {
  private readonly api = inject(OrderCutoffsService);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canWrite = computed(() => this.permissions.can('lfc_order_settings:write'));

  protected readonly state = signal<LoadState>('loading');
  protected readonly general = signal<OrderCutoffView | null>(null);

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.general.set(await this.api.general());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected edit(): void {
    this.open({ rule: this.general() });
  }

  protected grace(rule: OrderCutoffView): string | null {
    return graceSentence(rule);
  }

  protected sentence(rule: OrderCutoffView): string {
    return cutoffSentence(rule);
  }

  private open(data: CutoffPanelData): void {
    const ref = this.panelHost.open(CutoffPanel, { data });
    void ref.closed.then((saved) => {
      if (saved === true) {
        void this.load();
      }
    });
  }
}
