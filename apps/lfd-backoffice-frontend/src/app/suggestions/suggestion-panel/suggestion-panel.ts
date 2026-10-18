import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import type {
  StaffSuggestionChoicesView,
  StaffSuggestionOrder,
  StaffSuggestionRuleView,
  StaffSuggestionTriggerKind,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldButtonIconComponent,
  FoldCalloutComponent,
  FoldDateComponent,
  FoldFieldsetComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldNumberInputComponent,
  type FoldPanelDefaults,
  FoldPanelBodyComponent,
  FoldPanelFooterComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
} from 'fold-ng';

import type { CatalogProduct } from '../../contenu/storefront-catalog';
import { StorefrontProductPicker } from '../../contenu/storefront-product-picker/storefront-product-picker';
import { parisToday } from '../../shared/paris-today';
import { StaffSuggestionsService } from '../staff-suggestions.service';
import {
  copyDraftOf,
  draftOf,
  emptyDraft,
  MAX_SUGGESTED,
  missingOf,
  payloadOf,
  type SuggestionDraft,
  withoutSuggested,
  withSuggested,
  withTrigger,
} from '../suggestion-draft';
import {
  AUDIENCE_OPTIONS,
  orderLabel,
  placementOptions,
  refusalOf,
  TRIGGER_EXAMPLES,
  TRIGGER_OPTIONS,
} from '../suggestion-format';
import { type ConditionsDraft, conditionsPayloadOf } from '../suggestion-conditions';
import { SuggestionConditionsFieldset } from '../suggestion-conditions-fieldset/suggestion-conditions-fieldset';
import { summaryOf } from '../suggestion-summary';

/**
 * Ce que le panneau reçoit : la règle à réécrire (`null` = une neuve), et le
 * catalogue servi. `copy` (RS9) : la règle n'est qu'un modèle — le panneau
 * part de sa copie et enregistre une NOUVELLE règle, l'original intact.
 */
export interface SuggestionPanelData {
  readonly rule: StaffSuggestionRuleView | null;
  readonly choices: StaffSuggestionChoicesView;
  readonly copy?: boolean;
}

/**
 * **Créer ou réécrire une suggestion** — un sujet, lu de haut en bas : ce qui
 * la déclenche, ce qu'elle montre, où, à qui, quand, ce qu'elle dit, et ses
 * conditions facultatives (RS8).
 *
 * Les articles et les familles se choisissent dans le catalogue SERVI
 * (`/admin/suggestions/choices`) : l'écran ne propose que ce que le serveur
 * acceptera. Ferme sur l'id enregistré ; un refus reste dans le panneau, mot
 * pour mot.
 */
@Component({
  selector: 'app-suggestion-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldButtonIconComponent,
    FoldCalloutComponent,
    FoldDateComponent,
    FoldFieldsetComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldNumberInputComponent,
    FoldPanelBodyComponent,
    FoldPanelFooterComponent,
    FoldPanelHeaderComponent,
    StorefrontProductPicker,
    SuggestionConditionsFieldset,
  ],
  templateUrl: './suggestion-panel.html',
  styleUrl: './suggestion-panel.scss',
})
export class SuggestionPanel {
  static readonly foldPanel: FoldPanelDefaults = { side: 'auto', width: 'lg' };

  private readonly ref = inject<FoldPanelRef<string>>(FoldPanelRef);
  private readonly api = inject(StaffSuggestionsService);

  readonly data = input<SuggestionPanelData | undefined>(undefined);

  protected readonly triggers = TRIGGER_OPTIONS;
  protected readonly audiences = AUDIENCE_OPTIONS;
  protected readonly maxSuggested = MAX_SUGGESTED;

  protected readonly draft = linkedSignal<SuggestionDraft>(() => {
    const rule = this.data()?.rule ?? null;
    if (rule === null) {
      return emptyDraft(parisToday());
    }
    return this.copying() ? copyDraftOf(rule, parisToday()) : draftOf(rule);
  });
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly copying = computed(() => this.data()?.copy === true);
  protected readonly editing = computed(
    () => (this.data()?.rule ?? null) !== null && !this.copying(),
  );
  protected readonly heading = computed(() => {
    if (this.copying()) {
      return 'Dupliquer la suggestion';
    }
    return this.editing() ? 'Modifier la suggestion' : 'Nouvelle suggestion';
  });
  protected readonly placements = computed(() => placementOptions(this.draft().triggerKind));
  protected readonly products = computed<readonly CatalogProduct[]>(() =>
    (this.data()?.choices.articles ?? []).map((article) => ({
      sku: article.sku,
      name: article.name,
      shelf: article.familyId,
    })),
  );
  protected readonly families = computed(() =>
    (this.data()?.choices.families ?? []).map((family) => ({
      value: family.id,
      label: family.name,
    })),
  );
  protected readonly needsArticle = computed(
    () =>
      this.draft().triggerKind === 'product_in_cart' ||
      this.draft().triggerKind === 'product_viewed',
  );
  protected readonly needsFamily = computed(() => this.draft().triggerKind === 'category_in_cart');
  protected readonly suggested = computed(() =>
    this.draft().suggestedSkus.map((sku) => ({
      sku,
      name: this.products().find((product) => product.sku === sku)?.name ?? sku,
    })),
  );
  protected readonly missing = computed(() => missingOf(this.draft()));
  protected readonly example = computed(() => TRIGGER_EXAMPLES[this.draft().triggerKind]);
  /** L'aperçu : la règle relue en une phrase, à chaque frappe. */
  protected readonly summary = computed(() => {
    const draft = this.draft();
    const conditions = conditionsPayloadOf(draft.conditions, draft.placement);
    return summaryOf({ ...draft, conditions }, this.data()?.choices ?? null);
  });
  /** Le réglage d'ordre de la boutique — `null` tant qu'il n'est pas lu, ou s'il ne l'a pas été. */
  private readonly order = signal<StaffSuggestionOrder | null>(null);
  protected readonly priorityHint = computed(() => {
    const order = this.order();
    const rule =
      'De 0 à 999, la plus haute passe d’abord. Elle ne sert que si le réglage « Quand plusieurs suggestions s’appliquent » est « Par priorité ».';
    if (order === null) {
      return `${rule} Le réglage n’a pas pu être lu.`;
    }
    return order === 'priority'
      ? `${rule} C’est le cas aujourd’hui : elle compte.`
      : `${rule} Il est aujourd’hui sur « ${orderLabel(order)} » : elle ne compte pas pour l’instant.`;
  });

  constructor() {
    this.api.order().then(
      (view) => this.order.set(view.order),
      () => this.order.set(null),
    );
  }

  protected set<K extends keyof SuggestionDraft>(key: K, value: SuggestionDraft[K]): void {
    this.draft.update((draft) => ({ ...draft, [key]: value }));
  }

  protected setConditions(conditions: ConditionsDraft): void {
    this.set('conditions', conditions);
  }

  protected setTrigger(kind: StaffSuggestionTriggerKind): void {
    this.draft.update((draft) => withTrigger(draft, kind));
  }

  protected addSuggested(sku: string): void {
    this.draft.update((draft) => withSuggested(draft, sku));
  }

  protected removeSuggested(sku: string): void {
    this.draft.update((draft) => withoutSuggested(draft, sku));
  }

  protected async submit(): Promise<void> {
    if (this.missing() !== null) {
      return;
    }
    const rule = this.editing() ? (this.data()?.rule ?? null) : null;
    const payload = payloadOf(this.draft());
    this.busy.set(true);
    this.refusal.set(null);
    try {
      const saved =
        rule === null ? await this.api.create(payload) : await this.api.revise(rule.id, payload);
      this.ref.close(saved.id);
    } catch (error) {
      this.refusal.set(refusalOf(error, 'La suggestion n’a pas pu être enregistrée.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}
