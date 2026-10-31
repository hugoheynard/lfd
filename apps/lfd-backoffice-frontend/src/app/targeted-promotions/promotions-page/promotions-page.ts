import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PromotionLifecycleState, PromotionListView, PromotionView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldNavLayoutComponent,
  FoldPageLayoutComponent,
  FoldTabPanelComponent,
  FoldTabsComponent,
  type FoldTabItem,
} from 'fold-ng';

import { STATE_LABEL, STATE_VARIANT, summaryPhrase, windowPhrase } from '../promotion-format';
import { PromotionsService } from '../promotions.service';

type LoadState = 'loading' | 'error' | 'ready';

/** Les onglets : un par état, les terminées rangées avec les archivées. */
export type PromotionsTab = 'active' | 'scheduled' | 'paused' | 'closed';

const TAB_STATES: Readonly<Record<PromotionsTab, readonly PromotionLifecycleState[]>> = {
  active: ['active'],
  scheduled: ['scheduled'],
  paused: ['paused'],
  closed: ['ended', 'archived'],
};

const TAB_LABELS: Readonly<Record<PromotionsTab, string>> = {
  active: 'Actives',
  scheduled: 'Programmées',
  paused: 'En pause',
  closed: 'Terminées et archivées',
};

const TAB_KEYS: readonly PromotionsTab[] = ['active', 'scheduled', 'paused', 'closed'];

/**
 * **Promotions** — la liste (plan
 * `documentation/promotions/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.9, lot L7) : par public, par acheminement, par portée.
 *
 * « Nouvelle promotion » ne s'offre qu'une fois la bascule faite
 * (`editable`, dit par le serveur, lot L8). Le
 * paramètre `pickupId` restreint la liste à un point de retrait — le
 * raccourci de la fiche d'un site.
 */
@Component({
  selector: 'app-promotions-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldNavLayoutComponent,
    FoldPageLayoutComponent,
    FoldTabPanelComponent,
    FoldTabsComponent,
    RouterLink,
  ],
  templateUrl: './promotions-page.html',
  styleUrl: './promotions-page.scss',
})
export class PromotionsPage {
  private readonly api = inject(PromotionsService);

  /** Le point de retrait, depuis la fiche d'un site (paramètre de requête). */
  readonly pickupId = input<string | undefined>();

  protected readonly state = signal<LoadState>('loading');
  private readonly view = signal<PromotionListView | null>(null);
  protected readonly pickupNames = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly tab = signal<PromotionsTab>('active');

  protected readonly editable = computed(() => this.view()?.editable ?? false);
  protected readonly promotions = computed(() => this.view()?.promotions ?? []);
  protected readonly tabs = computed<readonly FoldTabItem<PromotionsTab>[]>(() =>
    TAB_KEYS.map((key) => ({ key, label: TAB_LABELS[key], badge: this.inTab(key).length })),
  );
  protected readonly shown = computed(() => this.inTab(this.tab()));
  protected readonly pointName = computed(() => {
    const id = this.pickupId();
    return id === undefined ? null : (this.pickupNames().get(id) ?? id);
  });

  protected readonly stateLabel = (view: PromotionView): string => STATE_LABEL[view.state];
  protected readonly stateVariant = (view: PromotionView) => STATE_VARIANT[view.state];
  protected readonly summary = (view: PromotionView): string =>
    summaryPhrase(view, this.pickupNames());
  protected readonly window = (view: PromotionView): string =>
    windowPhrase(view.validFrom, view.validTo);

  constructor() {
    // Le point vient de l'URL : relire quand il change, y compris au premier passage.
    effect(() => {
      const pickupId = this.pickupId() ?? null;
      untracked(() => void this.load(pickupId));
    });
  }

  protected reload(): void {
    void this.load(this.pickupId() ?? null);
  }

  private async load(pickupId: string | null): Promise<void> {
    this.state.set('loading');
    try {
      const [view, names] = await Promise.all([this.api.list(pickupId), this.api.pickupNames()]);
      this.view.set(view);
      this.pickupNames.set(names);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  private inTab(key: PromotionsTab): readonly PromotionView[] {
    return this.promotions().filter((promotion) => TAB_STATES[key].includes(promotion.state));
  }
}
