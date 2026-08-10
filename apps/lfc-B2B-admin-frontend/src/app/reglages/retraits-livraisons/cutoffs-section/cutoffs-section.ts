import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { OrderCutoffView, PickupAddressView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldInlineConfirmComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { OrderCutoffsService } from '../order-cutoffs.service';
import { CutoffPanel, type CutoffPanelData } from './cutoff-panel/cutoff-panel';
import { cutoffSentence, scopeLabel, weekdayLabel } from './cutoff-format';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Section **Heures limites de commande** des Réglages (staff).
 *
 * Une **règle par ligne** : ouvrir un second labo ou décaler le dimanche est de
 * la saisie, pas un déploiement. Les règles arrivent déjà triées de la plus
 * spécifique à la plus générale — c'est l'ordre dans lequel elles s'appliquent,
 * donc l'ordre dans lequel on les lit.
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
    FoldInlineConfirmComponent,
  ],
  templateUrl: './cutoffs-section.html',
  styleUrl: './cutoffs-section.scss',
})
export class CutoffsSection {
  private readonly api = inject(OrderCutoffsService);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  /**
   * Les points de retrait, pour le sélecteur de portée du panneau. Fournis par la
   * page : elle les a déjà chargés, les redemander ferait un appel pour rien et
   * afficherait une liste momentanément différente de celle du dessus.
   */
  readonly points = input<readonly PickupAddressView[]>([]);

  protected readonly state = signal<LoadState>('loading');
  protected readonly rules = signal<readonly OrderCutoffView[]>([]);
  protected readonly pendingRemoval = signal<string | null>(null);

  /**
   * Vrai quand **aucune règle par défaut** ne couvre le cas général. Ça se dit :
   * sans elle, tout ce qu'aucune règle précise ne vise n'a **aucune limite** —
   * ce qui est un choix valable, mais pas un choix qu'on fait sans le savoir.
   */
  protected readonly hasNoDefault = computed(
    () => this.rules().length > 0 && !this.rules().some((rule) => rule.pickupAddressId === null),
  );

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

  protected add(): void {
    this.open({ rule: null, points: this.points() });
  }

  protected edit(rule: OrderCutoffView): void {
    this.open({ rule, points: this.points() });
  }

  protected askRemove(rule: OrderCutoffView): void {
    this.pendingRemoval.set(rule.id);
  }

  protected cancelRemove(): void {
    this.pendingRemoval.set(null);
  }

  protected async remove(rule: OrderCutoffView): Promise<void> {
    this.pendingRemoval.set(null);
    try {
      await this.api.remove(rule.id);
      this.notify.success('Règle supprimée.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected scope(rule: OrderCutoffView): string {
    return scopeLabel(rule);
  }

  protected day(rule: OrderCutoffView): string {
    return weekdayLabel(rule.weekday);
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
