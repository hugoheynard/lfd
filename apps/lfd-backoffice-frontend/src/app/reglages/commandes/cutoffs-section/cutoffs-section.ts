import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { OrderCutoffView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
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
 * **La limite générale de la clientèle professionnelle** — Réglages ›
 * Commandes › Heure limite de commande.
 *
 * Une seule règle : la générale (décision de Hugo du 2026-10-21,
 * `documentation/limites-de-commande/schema-des-reglages.md` §4, point 4). Les
 * règles par point de retrait ou par jour sont retirées — le serveur les
 * refuse et n'en sert plus —, et l'écran ne les liste plus. La générale ne se
 * supprime pas d'ici : l'interrupteur l'éteint.
 *
 * Le serveur ouvre la lecture sous `lfc_order_settings:read` et l'écriture
 * sous `lfc_order_settings:write` (plan, §3.4) : sans ce dernier, la règle se
 * lit et aucun geste ne promet un refus.
 *
 * `dormant` (lot O3, §8.1) : l'heure limite générale est désactivée. La
 * section reste lisible et modifiable — la règle est en base, et la
 * réactivation la remettra telle quelle — mais elle est grisée et le dit :
 * ni elle ni son rattrapage ne s'appliquent.
 */
@Component({
  selector: 'app-cutoffs-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
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

  /** L'heure limite générale est désactivée : la règle dort. */
  readonly dormant = input(false);

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
