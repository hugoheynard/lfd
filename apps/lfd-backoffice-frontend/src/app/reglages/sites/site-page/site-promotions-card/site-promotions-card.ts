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
import type { PromotionListView, PromotionView } from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import {
  STATE_LABEL,
  STATE_VARIANT,
  audiencePhrase,
  effectPhrase,
  windowPhrase,
} from '../../../../targeted-promotions/promotion-format';
import { PromotionsService } from '../../../../targeted-promotions/promotions.service';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **Les promotions de ce point de retrait** — le raccourci de la fiche d'un
 * site vers l'écran Promotions (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.9, lot L7). Une lecture : celles dont l'acheminement est « retrait
 * à ce point », hors archivées, et le lien vers la liste pré-filtrée.
 *
 * Avant la bascule, la carte de remise à côté reste l'outil ; après (L8),
 * elle passe en lecture et « Nouvelle promotion pour ce site » ouvre
 * l'éditeur pré-rempli « Retrait · ce point ». Sans le droit de lire les
 * promotions, la carte le dit et n'empêche rien d'autre.
 */
@Component({
  selector: 'app-site-promotions-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldLoadingStateComponent,
    FoldPageSectionComponent,
    RouterLink,
  ],
  templateUrl: './site-promotions-card.html',
  styleUrl: './site-promotions-card.scss',
})
export class SitePromotionsCard {
  private readonly api = inject(PromotionsService);

  readonly pickupId = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  private readonly view = signal<PromotionListView | null>(null);

  /** Les promotions qui gardent leur place : actives, programmées, en pause. */
  protected readonly current = computed(() =>
    (this.view()?.promotions ?? []).filter(
      (promotion) => promotion.state !== 'archived' && promotion.state !== 'ended',
    ),
  );
  protected readonly editable = computed(() => this.view()?.editable ?? false);

  protected readonly stateLabel = (view: PromotionView): string => STATE_LABEL[view.state];
  protected readonly stateVariant = (view: PromotionView) => STATE_VARIANT[view.state];
  protected readonly line = (view: PromotionView): string =>
    `${effectPhrase(view.effect)} · ${audiencePhrase(view.audience)} · ${windowPhrase(view.validFrom, view.validTo)}`;

  constructor() {
    effect(() => {
      const pickupId = this.pickupId();
      untracked(() => void this.load(pickupId));
    });
  }

  private async load(pickupId: string): Promise<void> {
    this.state.set('loading');
    try {
      this.view.set(await this.api.list(pickupId));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
