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
import { Router } from '@angular/router';
import type {
  PromotionAudienceTargetView,
  PromotionEffectKindValue,
  PromotionFulfillmentKindValue,
  PromotionScopeTargetValue,
  PublishedCatalogView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldMultiselectComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { CatalogueService } from '../../b2b/catalogue/catalogue.service';
import { NotifyService } from '../../notify.service';
import { nativeValue } from '../../shared/native-input';
import { parisToday } from '../../shared/paris-today';
import { PromotionAudienceTree } from '../promotion-audience-tree/promotion-audience-tree';
import {
  draftOf,
  draftProblem,
  effectsFor,
  emptyDraft,
  targetIds,
  targetsFor,
  termsOf,
  withFulfillment,
  withScopeMode,
  withTargets,
  type PromotionDraft,
} from '../promotion-draft';
import { PromotionsService } from '../promotions.service';
import { catalogueChoicesOf, type CatalogueChoices } from './catalogue-choices';

type LoadState = 'loading' | 'error' | 'ready';

const EFFECT_LABEL: Readonly<Record<PromotionEffectKindValue, string>> = {
  percent_off: 'Pourcentage (%)',
  unit_amount_off: "Montant à l'unité (€ HT)",
  fixed_unit_price: 'Prix posé (€ HT)',
  basket_amount_off: 'Montant sur le panier (€ HT)',
};

const FULFILLMENT_LABEL: Readonly<Record<PromotionFulfillmentKindValue, string>> = {
  any: 'Tous les acheminements',
  pickup: 'Retrait · tous les points',
  pickup_point: 'Retrait · un point',
  delivery: 'Livraison',
};

const TARGET_LABEL: Readonly<Record<PromotionScopeTargetValue, string>> = {
  category: 'Familles',
  product: 'Produits (toutes leurs déclinaisons)',
  variant: 'Déclinaisons',
};

/**
 * **L'éditeur d'une promotion** (plan
 * `documentation/pricing/plan-promotions-par-audience-et-acheminement.md`,
 * § 13.9, lot L8) — une page, parce qu'une promotion règle sept sujets :
 * identité, effet, fenêtre, public, acheminement, portée et ses exceptions,
 * condition.
 *
 * Sans `id`, il pose ; avec, il modifie (le motif part au journal). Le
 * paramètre `pickupId` pré-remplit « Retrait · ce point » : c'est
 * « Nouvelle promotion pour ce site », depuis la fiche d'un site.
 *
 * Il ne juge que la forme (`draftProblem`) ; tout refus métier vient du
 * serveur, nommé, et reste affiché sans rien perdre de la saisie.
 */
@Component({
  selector: 'app-promotion-editor-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldCheckboxComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldMultiselectComponent,
    FoldPageLayoutComponent,
    PromotionAudienceTree,
  ],
  templateUrl: './promotion-editor-page.html',
  styleUrl: './promotion-editor-page.scss',
})
export class PromotionEditorPage {
  private readonly api = inject(PromotionsService);
  private readonly catalogueService = inject(CatalogueService);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  /** La promotion à modifier ; absente = une pose. */
  readonly id = input<string | undefined>();
  /** Le point de retrait pré-rempli, depuis la fiche d'un site. */
  readonly pickupId = input<string | undefined>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly draft = signal<PromotionDraft>(emptyDraft(parisToday(), null));
  protected readonly editable = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly saving = signal(false);
  private readonly catalogue = signal<CatalogueChoices>({ category: [], product: [], variant: [] });
  private readonly pickupNames = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly isNew = computed(() => this.id() === undefined);
  protected readonly title = computed(() =>
    this.isNew() ? 'Nouvelle promotion' : `Modifier « ${this.draft().internalName} »`,
  );
  protected readonly problem = computed(() => draftProblem(this.draft()));
  protected readonly canSave = computed(
    () => this.editable() && this.problem() === null && !this.saving(),
  );
  protected readonly atLine = computed(() => this.draft().fulfillmentKind === 'any');
  protected readonly fulfillmentOptions = (
    Object.keys(FULFILLMENT_LABEL) as PromotionFulfillmentKindValue[]
  ).map((kind) => ({ value: kind, label: FULFILLMENT_LABEL[kind] }));
  protected readonly scopeOptions = [
    { value: 'all_except' as const, label: 'Tout, sauf les exceptions' },
    { value: 'only' as const, label: 'Seulement ce qui est inclus' },
  ];
  protected readonly effectOptions = computed(() =>
    effectsFor(this.draft().fulfillmentKind).map((kind) => ({
      value: kind,
      label: EFFECT_LABEL[kind],
    })),
  );
  protected readonly pickupOptions = computed(() =>
    [...this.pickupNames()].map(([value, label]) => ({ value, label })),
  );
  /** Les listes de la portée : une par cible du point, et par sens pour produit et déclinaison. */
  protected readonly scopeLists = computed(() => {
    const draft = this.draft();
    const only = draft.scopeMode === 'only';
    return targetsFor(draft.fulfillmentKind).flatMap((target) =>
      (target === 'category' ? [only] : [true, false]).map((eligible) => ({
        target,
        eligible,
        label: `${TARGET_LABEL[target]} ${eligible ? 'incluses' : 'exclues'}`,
        options: this.catalogue()[target],
        value: targetIds(draft, target, eligible),
      })),
    );
  });

  constructor() {
    effect(() => {
      const id = this.id();
      const pickupId = this.pickupId() ?? null;
      untracked(() => void this.load(id ?? null, pickupId));
    });
  }

  protected edit(change: Partial<PromotionDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
    this.refusal.set(null);
  }

  protected setFulfillment(kind: PromotionFulfillmentKindValue): void {
    this.draft.update((draft) => withFulfillment(draft, kind));
  }

  protected setScopeMode(mode: 'all_except' | 'only'): void {
    this.draft.update((draft) => withScopeMode(draft, mode));
  }

  protected setTargets(
    target: PromotionScopeTargetValue,
    eligible: boolean,
    ids: readonly string[],
  ): void {
    this.draft.update((draft) => withTargets(draft, target, ids, eligible));
  }

  protected setAudiences(audiences: readonly PromotionAudienceTargetView[]): void {
    this.edit({ audiences });
  }

  protected readonly dateOf = nativeValue;

  protected async load(id: string | null, pickupId: string | null): Promise<void> {
    this.state.set('loading');
    try {
      const [source, catalogue, names, view] = await Promise.all([
        this.api.source(),
        this.catalogueService.published(),
        this.api.pickupNames(),
        id === null ? Promise.resolve(null) : this.api.get(id),
      ]);
      this.editable.set(source.editable);
      this.catalogue.set(catalogueChoicesOf(catalogue satisfies PublishedCatalogView));
      this.pickupNames.set(names);
      this.draft.set(view === null ? emptyDraft(parisToday(), pickupId) : draftOf(view));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected reload(): void {
    void this.load(this.id() ?? null, this.pickupId() ?? null);
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const draft = this.draft();
    const terms = termsOf(draft);
    try {
      const existing = this.id();
      const id =
        existing === undefined
          ? await this.api.pose(terms)
          : (await this.api.revise(existing, terms, terms.reason), existing);
      this.notify.success(existing === undefined ? 'Promotion posée.' : 'Promotion modifiée.');
      await this.router.navigate(['/promotions-ciblees', id]);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "La promotion n'a pas pu être enregistrée."));
    } finally {
      this.saving.set(false);
    }
  }
}
