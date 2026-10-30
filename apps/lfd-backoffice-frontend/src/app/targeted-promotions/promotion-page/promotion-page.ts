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
import type { PromotionScopeRuleView, PromotionView } from '@lfd/contracts';
import {
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import {
  AUDIENCE_TREE,
  STATE_LABEL,
  STATE_VARIANT,
  effectPhrase,
  fulfillmentPhrase,
  originPhrase,
  windowPhrase,
} from '../promotion-format';
import { PromotionsService } from '../promotions.service';

type LoadState = 'loading' | 'error' | 'ready';

/** Les choix de l'acheminement, dans l'ordre de l'éditeur (plan § 11). */
const FULFILLMENT_CHOICES = [
  { kind: 'any', label: 'Tous les acheminements' },
  { kind: 'pickup', label: 'Retrait · tous les points' },
  { kind: 'pickup_point', label: 'Retrait · un point' },
  { kind: 'delivery', label: 'Livraison' },
] as const;

const TARGET_LABEL: Readonly<Record<PromotionScopeRuleView['target'], string>> = {
  category: 'Famille',
  product: 'Produit (toutes ses déclinaisons)',
  variant: 'Déclinaison',
};

/**
 * **La fiche d'une promotion** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.9, lot L7) — les sept blocs de l'éditeur, en LECTURE : identité,
 * effet, fenêtre, public (dans l'arbre « Tout le monde / Particuliers /
 * Pros »), acheminement, portée et ses exceptions, conditions.
 *
 * Les gestes (modifier, suspendre, archiver) arrivent avec la bascule, au
 * lot L8 : d'ici là, le serveur les refuse.
 */
@Component({
  selector: 'app-promotion-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
  ],
  templateUrl: './promotion-page.html',
  styleUrl: './promotion-page.scss',
})
export class PromotionPage {
  private readonly api = inject(PromotionsService);

  readonly id = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly promotion = signal<PromotionView | null>(null);
  private readonly pickupNames = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly audienceTree = AUDIENCE_TREE;
  protected readonly fulfillmentChoices = FULFILLMENT_CHOICES;
  protected readonly targetLabel = TARGET_LABEL;

  protected readonly stateLabel = computed(() => {
    const promotion = this.promotion();
    return promotion === null ? null : STATE_LABEL[promotion.state];
  });
  protected readonly stateVariant = computed(() => {
    const promotion = this.promotion();
    return promotion === null ? 'neutral' : STATE_VARIANT[promotion.state];
  });
  protected readonly origin = computed(() => originPhrase(this.promotion()?.legacySource ?? null));

  protected readonly effect = (view: PromotionView): string => effectPhrase(view.effect);
  protected readonly window = (view: PromotionView): string =>
    windowPhrase(view.validFrom, view.validTo);
  protected readonly fulfillment = (view: PromotionView): string =>
    fulfillmentPhrase(view.fulfillment, this.pickupNames());
  protected readonly instant = (at: string): string =>
    new Date(at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  constructor() {
    effect(() => {
      const id = this.id();
      untracked(() => void this.load(id));
    });
  }

  protected async load(id: string): Promise<void> {
    this.state.set('loading');
    try {
      const [promotion, names] = await Promise.all([this.api.get(id), this.api.pickupNames()]);
      this.promotion.set(promotion);
      this.pickupNames.set(names);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
