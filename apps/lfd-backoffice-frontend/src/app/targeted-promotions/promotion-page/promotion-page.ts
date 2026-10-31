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
import { Router, RouterLink } from '@angular/router';
import type {
  PromotionAudienceTargetView,
  PromotionScopeTargetValue,
  PromotionView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';
import {
  FoldBackLinkComponent,
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldCheckboxComponent,
  FoldDateComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldLoadingStateComponent,
  FoldMultiselectComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { CatalogueService } from '../../b2b/catalogue/catalogue.service';
import { NotifyService } from '../../notify.service';
import { parisToday } from '../../shared/paris-today';
import {
  catalogueChoicesOf,
  choiceNames,
  withRuleTargets,
  type CatalogueChoices,
} from '../catalogue-choices';
import { PromotionAudienceTree } from '../promotion-audience-tree/promotion-audience-tree';
import {
  draftOf,
  draftProblem,
  duplicateDraft,
  effectsFor,
  emptyDraft,
  targetIds,
  targetsFor,
  switchType,
  termsOf,
  withScopeMode,
  withTargets,
  type DraftFulfillmentKind,
  type DraftReach,
  type DraftSetAside,
  type PromotionDraft,
} from '../promotion-draft';
import { STATE_LABEL, STATE_VARIANT, originPhrase } from '../promotion-format';
import { draftSummary } from '../promotion-summary';
import { PromotionsService } from '../promotions.service';
import {
  EFFECT_LABEL,
  FULFILLMENT_OPTIONS,
  PICKUP_REACH_OPTIONS,
  DELIVERY_REACH_OPTIONS,
  SCOPE_OPTIONS,
  TARGET_LABEL,
} from '../promotion-words';

type LoadState = 'loading' | 'error' | 'ready';

const NO_CHOICES: CatalogueChoices = { category: [], product: [], variant: [] };

/**
 * **La page d'une promotion — fiche ET formulaire** (décision de Hugo du
 * 2026-10-31 : un seul layout, pas de mode lecture et de mode édition).
 *
 * Le genre de remise se choisit d'abord (décision de Hugo du 2026-10-31) :
 * baisser le prix des articles, ou remise sur le panier. Les cartes qui
 * suivent ne montrent que ce qui a du sens pour ce genre — quoi, pour qui,
 * comment le client la reçoit, sur quoi, quand — puis son état, ses gestes.
 * Un résumé en une phrase, en tête, suit la saisie.
 *
 * Sans `id`, elle pose ; avec, elle révise (le motif part au journal). Sans
 * `b2b_pricing:write`, avant la bascule de la source, ou une fois archivée,
 * les mêmes champs sont désactivés et rien ne s'enregistre. `pickupId`
 * pré-remplit « Remise sur le panier · retrait à ce point », depuis la fiche
 * d'un site.
 *
 * Elle ne juge que la forme (`draftProblem`) ; tout refus métier vient du
 * serveur, nommé, et reste affiché sans rien perdre de la saisie.
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
    FoldCheckboxComponent,
    FoldDateComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldLoadingStateComponent,
    FoldMultiselectComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
    PromotionAudienceTree,
    RouterLink,
  ],
  templateUrl: './promotion-page.html',
  styleUrl: './promotion-page.scss',
})
export class PromotionPage {
  private readonly api = inject(PromotionsService);
  private readonly catalogueService = inject(CatalogueService);
  private readonly permissions = inject(PermissionsStore);
  private readonly notify = inject(NotifyService);
  private readonly router = inject(Router);

  /** La promotion ; absente = une pose. */
  readonly id = input<string | undefined>();
  /** Le point de retrait pré-rempli, depuis la fiche d'un site. */
  readonly pickupId = input<string | undefined>();
  /** La promotion à copier pour un autre public — une pose préremplie, sans public. */
  readonly from = input<string | undefined>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly promotion = signal<PromotionView | null>(null);
  protected readonly draft = signal<PromotionDraft>(emptyDraft(parisToday(), null));
  /** Ce que l'autre genre de remise avait en propre, pour un aller-retour sans perte. */
  private readonly setAside = signal<DraftSetAside>({});
  /** Les termes relus, pour une révision ; `null` = une pose. */
  private readonly loaded = signal<string | null>(null);
  /** La source a basculé : le serveur accepte les écritures (relu avec la fiche). */
  private readonly sourceEditable = signal(false);
  protected readonly catalogueMissing = signal(false);
  protected readonly refusal = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly reason = signal('');
  protected readonly acting = signal(false);
  private readonly catalogue = signal<CatalogueChoices>(NO_CHOICES);
  /** Les points proposés aujourd'hui ; `null` = la liste ne se lit pas. */
  private readonly activePickups = signal<ReadonlyMap<string, string> | null>(null);
  /** Tous les sites, archivés compris — pour nommer un point archivé. */
  private readonly siteNames = signal<ReadonlyMap<string, string>>(new Map());
  private readonly zoneNames = signal<ReadonlyMap<string, string>>(new Map());
  /** Les noms connus d'un point : actif d'abord, puis la palette. */
  private readonly pickupNames = computed(
    () => new Map([...this.siteNames(), ...(this.activePickups() ?? new Map<string, string>())]),
  );

  protected readonly isNew = computed(() => this.id() === undefined);
  /** Le nom de l'original, pour une copie ; `null` sinon. */
  protected readonly copiedFrom = signal<string | null>(null);
  /** Copier ne pose rien : il ouvre une pose préremplie, sous le seul droit d'écrire. */
  protected readonly canDuplicate = computed(
    () => !this.isNew() && this.permissions.can('b2b_pricing:write'),
  );
  /** Le droit, puis le serveur, puis la promotion : une seule réponse pour toute la page. */
  protected readonly writable = computed(
    () =>
      this.permissions.can('b2b_pricing:write') &&
      (this.isNew() || (this.sourceEditable() && this.promotion()?.archived === null)),
  );
  protected readonly readOnly = computed(() => !this.writable());
  protected readonly title = computed(() =>
    this.isNew() ? 'Nouvelle promotion' : (this.promotion()?.internalName ?? 'Promotion'),
  );
  protected readonly summary = computed(() =>
    draftSummary(this.draft(), choiceNames(this.catalogue()), this.pickupNames(), this.zoneNames()),
  );
  protected readonly problem = computed(() => draftProblem(this.draft()));
  /** Reposée à l'identique, une révision ne trace rien : rien à enregistrer. */
  private readonly unchanged = computed(
    () => this.loaded() !== null && this.loaded() === JSON.stringify(termsOf(this.draft())),
  );
  protected readonly canSave = computed(
    () => this.writable() && this.problem() === null && !this.saving() && !this.unchanged(),
  );
  protected readonly canAct = computed(() => this.writable() && !this.isNew() && !this.acting());

  protected readonly stateLabel = computed(() => {
    const promotion = this.promotion();
    return promotion === null ? null : STATE_LABEL[promotion.state];
  });
  protected readonly stateVariant = computed(() => {
    const promotion = this.promotion();
    return promotion === null ? 'neutral' : STATE_VARIANT[promotion.state];
  });
  protected readonly origin = computed(() => originPhrase(this.promotion()?.legacySource ?? null));

  protected readonly atLine = computed(() => this.draft().fulfillmentKind === 'displayed_price');
  /** Le cumul dit son effet au point où il joue : la ligne, ou le panier (M7). */
  protected readonly cumulativeHint = computed(() =>
    this.atLine()
      ? "Elle s'ajoute aux autres promotions cumulables du même article (−20 % puis −15 % du reste = −32 %). Sinon, le client reçoit la plus avantageuse."
      : "Sa remise s'ajoute aux autres remises de panier cumulables (−10 % puis −5 % du reste), cinq au plus. Sinon, le client reçoit la plus avantageuse.",
  );
  /** Les deux genres, tous désactivés en lecture seule. */
  protected readonly typeOptions = computed(() =>
    FULFILLMENT_OPTIONS.map(({ value, label, icon }) => ({
      value,
      label,
      icon,
      disabled: this.readOnly(),
    })),
  );
  protected readonly typeHint = computed(
    () => FULFILLMENT_OPTIONS.find((option) => option.value === this.draft().fulfillmentKind)?.hint,
  );
  protected readonly effectHint = computed(() =>
    this.atLine()
      ? 'Un pourcentage, un montant retiré à chaque article, ou un prix posé.'
      : 'Un pourcentage, ou un montant retiré du panier.',
  );
  protected readonly pickupReachOptions = PICKUP_REACH_OPTIONS;
  protected readonly deliveryReachOptions = DELIVERY_REACH_OPTIONS;
  protected readonly scopeOptions = SCOPE_OPTIONS;
  protected readonly effectOptions = computed(() =>
    effectsFor(this.draft().fulfillmentKind).map((kind) => ({
      value: kind,
      label: EFFECT_LABEL[kind],
    })),
  );
  /**
   * Les points proposables : les sites actifs, plus ceux que la promotion
   * garde et qui ne le sont plus — visibles, nommés « archivé », pour qu'on
   * les retire sciemment plutôt qu'en silence.
   */
  protected readonly pickupOptions = computed(() => {
    const active = this.activePickups();
    const options = [...(active ?? [])].map(([value, label]) => ({ value, label }));
    const kept = this.draft().pickup.ids.filter((id) => !active?.has(id));
    return [
      ...options,
      ...kept.map((id) => {
        const name = this.siteNames().get(id) ?? id;
        return { value: id, label: active === null ? name : `${name} (archivé)` };
      }),
    ];
  });
  /** Les zones proposables ; une zone visée ne se supprime pas (refus serveur). */
  protected readonly zoneOptions = computed(() => {
    const known = this.zoneNames();
    const options = [...known].map(([value, label]) => ({ value, label }));
    const kept = this.draft().delivery.ids.filter((id) => !known.has(id));
    return [...options, ...kept.map((id) => ({ value: id, label: id }))];
  });
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
  protected readonly instant = (at: string): string =>
    new Date(at).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });

  constructor() {
    effect(() => {
      const id = this.id();
      const pickupId = this.pickupId() ?? null;
      const from = this.from() ?? null;
      untracked(() => void this.load(id ?? null, pickupId, from));
    });
  }

  protected edit(change: Partial<PromotionDraft>): void {
    this.draft.update((draft) => ({ ...draft, ...change }));
    this.refusal.set(null);
  }

  /** Le genre de remise ; la vue ne parle que `string`, d'où le tri. */
  protected setType(value: string): void {
    const kind = FULFILLMENT_OPTIONS.find((option) => option.value === value)?.value;
    if (kind === undefined || this.readOnly()) {
      return;
    }
    this.switchTo(kind);
  }

  private switchTo(kind: DraftFulfillmentKind): void {
    const next = switchType(this.draft(), this.setAside(), kind);
    this.draft.set(next.draft);
    this.setAside.set(next.setAside);
    this.refusal.set(null);
  }

  /** Retrait ou livraison : la case, « tous / certains », ou la sélection. */
  protected setReach(side: 'pickup' | 'delivery', change: Partial<DraftReach>): void {
    this.draft.update((draft) => ({ ...draft, [side]: { ...draft[side], ...change } }));
    this.refusal.set(null);
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

  protected async load(
    id: string | null,
    pickupId: string | null,
    from: string | null = null,
  ): Promise<void> {
    this.state.set('loading');
    try {
      const [catalogue, active, sites, zones, view, source, original] = await Promise.all([
        // Le catalogue n'est qu'une aide au choix : un lecteur qui ne peut pas
        // le lire voit quand même la promotion, ses cibles nommées par elle.
        this.catalogueService.published().then(catalogueChoicesOf, () => null),
        this.api.activePickupNames(),
        this.api.everySiteName(),
        this.api.zoneNames(),
        id === null ? Promise.resolve(null) : this.api.get(id),
        id === null ? Promise.resolve(null) : this.api.source(),
        id === null && from !== null ? this.api.get(from) : Promise.resolve(null),
      ]);
      this.catalogueMissing.set(catalogue === null);
      const rules = (view ?? original)?.scope.rules ?? [];
      this.catalogue.set(withRuleTargets(catalogue ?? NO_CHOICES, rules));
      this.activePickups.set(active);
      this.siteNames.set(sites);
      this.zoneNames.set(zones);
      this.promotion.set(view);
      this.sourceEditable.set(source?.editable ?? false);
      this.copiedFrom.set(original?.internalName ?? null);
      const draft =
        view !== null
          ? draftOf(view)
          : original !== null
            ? duplicateDraft(original)
            : emptyDraft(parisToday(), pickupId);
      this.draft.set(draft);
      this.setAside.set({});
      this.loaded.set(view === null ? null : JSON.stringify(termsOf(draft)));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected reload(): void {
    void this.load(this.id() ?? null, this.pickupId() ?? null, this.from() ?? null);
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) {
      return;
    }
    this.saving.set(true);
    this.refusal.set(null);
    const terms = termsOf(this.draft());
    try {
      const existing = this.id();
      if (existing === undefined) {
        const id = await this.api.pose(terms);
        this.notify.success('Promotion posée.');
        await this.router.navigate(['/promotions-ciblees', id]);
      } else {
        await this.api.revise(existing, terms, terms.reason);
        this.notify.success('Promotion modifiée.');
        await this.load(existing, null);
      }
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "La promotion n'a pas pu être enregistrée."));
    } finally {
      this.saving.set(false);
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
      await this.load(view.id, null);
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, "Le geste n'a pas pu être fait."));
    } finally {
      this.acting.set(false);
    }
  }
}
