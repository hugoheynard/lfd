import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { GeneralOrderCutoffView, OrderTimeLimitListItem } from '@lfd/pim-contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { NotifyService } from '../../../notify.service';
import { LimitPanel, type LimitPanelData } from '../limit-panel/limit-panel';
import { OrderTimeLimitsService } from '../order-time-limits.service';
import { ArchivedList, type ArchivedEntry } from '../../shared/archived-list/archived-list';
import {
  byName,
  excludedPhrase,
  generalCutoffPhrase,
  limitPhrase,
  scopeKind,
  scopeLabel,
} from '../limit-format';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Limites de commande** — la règle générale du commerce, puis les produits
 * et les familles qui ont leur propre limite.
 *
 * La règle générale (« toute la production ») se règle dans Réglages ›
 * Commandes › Heure limite et se montre ici EN LECTURE : cette page est murée
 * par `pim_catalog`, pas par le droit de la régler (décision de Hugo du
 * 2026-10-21). Le référentiel pose une limite sur un produit ou sur une
 * famille (décision du 2026-11-23) ; quand plusieurs visent un article, la plus
 * stricte gagne.
 *
 * Une ligne de famille dit combien de produits elle exclut, et déplie leur
 * liste pour réintégrer chacun. Une exclusion devenue inerte (le produit a
 * quitté la famille) n'y est pas signalée : il faudrait la lignée de chaque
 * produit ; elle se montre et se retire comme une autre.
 *
 * Une limite archivée cesse de s'appliquer, et se restaure depuis la liste
 * repliée sous le tableau.
 */
@Component({
  selector: 'app-order-time-limits-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
    FoldBadgeComponent,
    FoldCardComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    RouterLink,
    ArchivedList,
  ],
  templateUrl: './order-time-limits-page.html',
  styleUrl: './order-time-limits-page.scss',
})
export class OrderTimeLimitsPage {
  private readonly api = inject(OrderTimeLimitsService);
  private readonly panelHost = inject(FoldPanelHostService);
  private readonly notify = inject(NotifyService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly rules = signal<readonly OrderTimeLimitListItem[]>([]);
  protected readonly general = signal<GeneralOrderCutoffView | null>(null);
  protected readonly pendingRemoval = signal<string | null>(null);
  /** La limite de famille dont la liste des exclus est dépliée. */
  protected readonly openExclusions = signal<string | null>(null);

  /** Les limites en vigueur, par nom. */
  protected readonly ordered = computed(() =>
    this.rules()
      .filter((rule) => !rule.archived)
      .sort(byName),
  );

  /** Les archivées : elles ne s'appliquent plus, et reviennent d'ici. */
  protected readonly archived = computed<readonly ArchivedEntry[]>(() =>
    this.rules()
      .filter((rule) => rule.archived)
      .sort(byName)
      .map((rule) => ({
        key: rule.id,
        label: `${scopeKind(rule)} · ${scopeLabel(rule)}`,
        detail: limitPhrase(rule),
      })),
  );
  protected readonly busy = signal(false);

  /** « La veille à 18:00, rattrapage aucun », ou `null` sans règle générale. */
  protected readonly generalPhrase = computed(() => {
    const general = this.general();
    return general === null ? null : generalCutoffPhrase(general);
  });

  constructor() {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [rules, general] = await Promise.all([this.api.list(), this.api.general()]);
      this.rules.set(rules);
      this.general.set(general);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** Pose une limite : la portée et la cible se choisissent dans le panneau. */
  protected create(): void {
    this.openPanel({ scope: null, label: '', rule: null, known: this.rules() });
  }

  protected edit(rule: OrderTimeLimitListItem): void {
    if (rule.scope.type !== 'product' && rule.scope.type !== 'category') {
      return;
    }
    this.openPanel({
      scope: { type: rule.scope.type, id: rule.scope.id ?? '' },
      label: scopeLabel(rule),
      rule,
    });
  }

  private openPanel(data: LimitPanelData): void {
    const ref = this.panelHost.open(LimitPanel, { data });
    void ref.closed.then((saved) => {
      if (saved === true) {
        void this.load();
      }
    });
  }

  protected toggleExclusions(rule: OrderTimeLimitListItem): void {
    this.openExclusions.update((open) => (open === rule.id ? null : rule.id));
  }

  /** Réintègre un produit exclu : la limite de la famille le vise de nouveau. */
  protected async include(rule: OrderTimeLimitListItem, productId: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.include(rule.id, productId);
      this.notify.success(
        `Produit réintégré — la limite de ${scopeLabel(rule)} le vise de nouveau.`,
      );
      await this.load();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected kind(rule: OrderTimeLimitListItem): string {
    return scopeKind(rule);
  }

  protected excluded(rule: OrderTimeLimitListItem): string {
    return excludedPhrase(rule.exclusions.length);
  }

  protected askRemove(rule: OrderTimeLimitListItem): void {
    this.pendingRemoval.set(rule.id);
  }

  protected cancelRemove(): void {
    this.pendingRemoval.set(null);
  }

  protected async remove(rule: OrderTimeLimitListItem): Promise<void> {
    this.pendingRemoval.set(null);
    try {
      await this.api.archive(rule.id);
      this.notify.success(
        "Limite archivée — elle ne s'applique plus ; ses produits restent jugés par leurs autres limites et la règle générale.",
      );
      await this.load();
    } catch (error) {
      this.notify.error(error);
    }
  }

  protected async restore(id: string): Promise<void> {
    this.busy.set(true);
    try {
      await this.api.restore(id);
      this.notify.success('Limite restaurée — elle s’applique de nouveau.');
      await this.load();
    } catch (error) {
      this.notify.error(error);
    } finally {
      this.busy.set(false);
    }
  }

  protected name(rule: OrderTimeLimitListItem): string {
    return scopeLabel(rule);
  }

  protected limit(rule: OrderTimeLimitListItem): string {
    return limitPhrase(rule);
  }
}
