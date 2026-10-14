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
import { cutoffSentence, graceSentence, scopeLabel, weekdayLabel } from './cutoff-format';

type LoadState = 'loading' | 'ready' | 'error';

/** La limite générale : tous les points, tous les jours. */
function isGeneral(rule: OrderCutoffView): boolean {
  return rule.pickupAddressId === null && rule.weekday === null;
}

/**
 * **La limite générale de la clientèle professionnelle** — Réglages ›
 * Commandes › Heure limite de commande.
 *
 * Option A de `documentation/commandes/plan-reglages-commandes.md` (§2, Hugo,
 * 2026-10-13) : seule la ligne générale d'`OrderCutoff` s'édite ici. Une règle
 * par point de retrait ou par jour, s'il en reste, se lit sans geste, marquée
 * « non reprise » : son démontage est décidé (`demontage-order-cutoff.md`).
 * Aucune ne se supprime d'ici — retirer la ligne générale ouvrirait toute
 * commande que le référentiel ne limite pas.
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
  protected readonly rules = signal<readonly OrderCutoffView[]>([]);

  protected readonly general = computed(() => this.rules().find(isGeneral) ?? null);
  /** Les règles par point ou par jour : lues, plus réglées (option A). */
  protected readonly legacy = computed(() => this.rules().filter((rule) => !isGeneral(rule)));

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.rules.set(await this.api.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected edit(): void {
    this.open({ rule: this.general() });
  }

  protected scope(rule: OrderCutoffView): string {
    return scopeLabel(rule);
  }

  protected day(rule: OrderCutoffView): string {
    return weekdayLabel(rule.weekday);
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
