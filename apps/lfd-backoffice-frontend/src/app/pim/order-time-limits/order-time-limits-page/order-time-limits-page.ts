import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { GeneralOrderCutoffView, OrderTimeLimitView } from '@lfd/pim-contracts';
import {
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
import { LimitPanel } from '../limit-panel/limit-panel';
import { OrderTimeLimitsService } from '../order-time-limits.service';
import { ArchivedList, type ArchivedEntry } from '../../shared/archived-list/archived-list';
import { byName, generalCutoffPhrase, limitPhrase, scopeLabel } from '../limit-format';

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Limites de commande** — la règle générale du commerce, puis les produits
 * qui ont leur propre limite.
 *
 * ## Depuis le 2026-10-21 (décision de Hugo)
 *
 * `limites-de-commande/schema-des-reglages.md` §4 : une seule limite « pour
 * tout le catalogue », la règle générale du commerce — réglée dans Réglages ›
 * Commandes › Heure limite, montrée ici EN LECTURE (cette page est murée par
 * `pim_catalog`, pas par le droit de la régler). Le référentiel ne garde
 * qu'une limite par produit, règle entière, sans rattrapage. Plus de rang
 * « toute la production », plus de famille, plus d'héritage.
 *
 * ## Ce que cet écran ne fait pas
 *
 * Il ne **pose** pas de limite : poser se fait depuis la fiche du produit,
 * c'est là qu'on regarde quand on se demande ce que CET article demande. Ici,
 * on lit, on modifie, on archive — une limite archivée cesse de s'appliquer, et
 * se restaure depuis la liste repliée sous le tableau.
 */
@Component({
  selector: 'app-order-time-limits-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageLayoutComponent,
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
  protected readonly rules = signal<readonly OrderTimeLimitView[]>([]);
  protected readonly general = signal<GeneralOrderCutoffView | null>(null);
  protected readonly pendingRemoval = signal<string | null>(null);

  /** Les limites en vigueur, par nom de produit. */
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
      .map((rule) => ({ key: rule.id, label: scopeLabel(rule), detail: limitPhrase(rule) })),
  );
  protected readonly busy = signal(false);

  /** « La veille à 18:00, rattrapage aucun », ou `null` sans règle générale. */
  protected readonly generalPhrase = computed(() => {
    const general = this.general();
    return general === null ? null : generalCutoffPhrase(general);
  });

  /** La règle générale existe mais l'interrupteur la coupe. */

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

  protected edit(rule: OrderTimeLimitView): void {
    const ref = this.panelHost.open(LimitPanel, {
      data: { productId: rule.scope.id ?? '', label: scopeLabel(rule), rule },
    });
    void ref.closed.then((saved) => {
      if (saved === true) {
        void this.load();
      }
    });
  }

  protected askRemove(rule: OrderTimeLimitView): void {
    this.pendingRemoval.set(rule.id);
  }

  protected cancelRemove(): void {
    this.pendingRemoval.set(null);
  }

  protected async remove(rule: OrderTimeLimitView): Promise<void> {
    this.pendingRemoval.set(null);
    try {
      await this.api.archive(rule.id);
      this.notify.success(
        "Limite archivée — elle ne s'applique plus ; seule la règle générale juge ce produit.",
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

  protected name(rule: OrderTimeLimitView): string {
    return scopeLabel(rule);
  }

  protected limit(rule: OrderTimeLimitView): string {
    return limitPhrase(rule);
  }
}
