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
import type { PromotionScopeRuleView, PromotionView } from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldInputComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';

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
 * Ses gestes (lot L8) : modifier (l'éditeur), mettre en pause, reprendre,
 * archiver — motif obligatoire pour archiver. Ils ne s'offrent qu'une fois
 * la bascule faite ; d'ici là, le serveur les refuserait.
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
    FoldInputComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    RouterLink,
  ],
  templateUrl: './promotion-page.html',
  styleUrl: './promotion-page.scss',
})
export class PromotionPage {
  private readonly api = inject(PromotionsService);
  private readonly notify = inject(NotifyService);

  readonly id = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly promotion = signal<PromotionView | null>(null);
  private readonly pickupNames = signal<ReadonlyMap<string, string>>(new Map());

  /** L'écran écrit-il ? Dit par le serveur (la source), relu avec la fiche. */
  protected readonly editable = signal(false);
  protected readonly reason = signal('');
  protected readonly acting = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly canAct = computed(
    () => this.editable() && this.promotion()?.archived === null && !this.acting(),
  );

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
      const [promotion, names, source] = await Promise.all([
        this.api.get(id),
        this.api.pickupNames(),
        this.api.source(),
      ]);
      this.promotion.set(promotion);
      this.editable.set(source.editable);
      this.pickupNames.set(names);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected async pause(): Promise<void> {
    await this.act('Promotion mise en pause.', (view) => this.api.pause(view, this.reasonOrNull()));
  }

  protected async resume(): Promise<void> {
    await this.act('Promotion reprise.', (view) => this.api.resume(view, this.reasonOrNull()));
  }

  /** Archiver est terminal : le motif est exigé, et l'agrégat le refuse vide. */
  protected async archive(): Promise<void> {
    await this.act('Promotion archivée.', (view) => this.api.archive(view, this.reason().trim()));
  }

  private reasonOrNull(): string | null {
    const reason = this.reason().trim();
    return reason === '' ? null : reason;
  }

  private async act(done: string, gesture: (view: PromotionView) => Promise<void>): Promise<void> {
    const view = this.promotion();
    if (view === null || !this.canAct()) {
      return;
    }
    this.acting.set(true);
    this.refusal.set(null);
    try {
      await gesture(view);
      this.notify.success(done);
      this.reason.set('');
      await this.load(view.id);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Le geste n'a pas pu être fait."));
    } finally {
      this.acting.set(false);
    }
  }
}
