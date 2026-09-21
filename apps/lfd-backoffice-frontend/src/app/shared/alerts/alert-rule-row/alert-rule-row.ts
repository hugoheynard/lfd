import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCheckboxComponent,
  FoldElementTitleComponent,
  FoldInfoComponent,
  FoldNumberInputComponent,
  FoldSelectComponent,
} from 'fold-ng';
import {
  ALERT_KINDS,
  type AlertDelivery,
  type AlertParams,
  type AlertRule,
  type AlertRuleView,
  type AlertThresholdTier,
  type DriftDirection,
  type FirstOrderParams,
  type QuantityDriftParams,
  type QuantityOutlierParams,
  type SubscriptionChangedParams,
} from '@lfd/contracts';

import { ALERT_KIND_LABELS, DELIVERY_LABELS } from '../alert-kind-labels';
import { ThresholdTiersField } from '../threshold-tiers-field/threshold-tiers-field';

/** Les sens d'écart proposés, dans l'ordre où on les lit. */
const DIRECTIONS: readonly { readonly value: DriftDirection; readonly label: string }[] = [
  { value: 'both', label: 'Hausse et baisse' },
  { value: 'up', label: 'Hausse seulement' },
  { value: 'down', label: 'Baisse seulement' },
];

/**
 * **Une règle d'alerte** dans un écran de réglages : ce qu'elle surveille, ses
 * seuils, et qui elle prévient.
 *
 * L'édition se fait sur un **brouillon local** et ne part qu'au clic : ces seuils
 * se règlent par tâtonnement (« 50 %, non, plutôt 80 »), et enregistrer à chaque
 * frappe enverrait une salve d'écritures dont les états intermédiaires n'ont
 * jamais été voulus.
 *
 * La case « afficher au client » n'existe que pour les types `customerShowable`
 * — et le **serveur le refuse** aussi, depuis qu'on a constaté que l'invariant ne
 * tenait qu'ici.
 */
@Component({
  selector: 'app-alert-rule-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldElementTitleComponent,
    FoldNumberInputComponent,
    FoldSelectComponent,
    FoldCheckboxComponent,
    FoldButtonComponent,
    FoldInfoComponent,
    ThresholdTiersField,
  ],
  templateUrl: './alert-rule-row.html',
  styleUrl: './alert-rule-row.scss',
})
export class AlertRuleRow {
  readonly rule = input.required<AlertRuleView>();
  readonly busy = input(false);
  /**
   * La rangée porte-t-elle son propre interrupteur ?
   *
   * Vrai dans les Réglages, où la rangée EST la règle. Faux sur la fiche d'un
   * compte, où l'activation vit au niveau de la carte : deux interrupteurs pour
   * la même chose au même écran, c'est celui qu'on ne regarde pas qui finit par
   * contredire l'autre.
   */
  readonly showEnabled = input(true);
  readonly save = output<AlertRule>();

  protected readonly directions = DIRECTIONS;
  protected readonly deliveryLabels = DELIVERY_LABELS;

  /**
   * Le brouillon. `linkedSignal` le **réaligne** quand le parent recharge après
   * un enregistrement — sans ça l'écran continuerait d'afficher « modifié » sur
   * des valeurs que le serveur vient pourtant d'accepter.
   */
  protected readonly draft = linkedSignal<AlertRuleView, AlertRule>({
    source: this.rule,
    computation: (view) => ({
      enabled: view.enabled,
      params: view.params,
      delivery: view.delivery,
    }),
  });

  protected readonly showParams = computed(() => this.draft().enabled || !this.showEnabled());
  protected readonly labels = computed(() => ALERT_KIND_LABELS[this.rule().kind]);
  protected readonly customerShowable = computed(
    () => ALERT_KINDS[this.rule().kind].customerShowable,
  );

  /** Les paramètres du type courant, narrés pour le template. */
  protected readonly firstOrder = computed(() => paramsOf(this.draft(), 'product.first_order'));
  protected readonly drift = computed(() => paramsOf(this.draft(), 'product.quantity_drift'));
  protected readonly outlier = computed(() => paramsOf(this.draft(), 'product.quantity_outlier'));
  protected readonly subscription = computed(() => paramsOf(this.draft(), 'subscription.changed'));

  protected readonly dirty = computed(() => {
    const view = this.rule();
    const draft = this.draft();
    return (
      view.enabled !== draft.enabled ||
      JSON.stringify(view.params) !== JSON.stringify(draft.params) ||
      JSON.stringify(view.delivery) !== JSON.stringify(draft.delivery)
    );
  });

  protected setEnabled(enabled: boolean): void {
    this.draft.update((rule) => ({ ...rule, enabled }));
  }

  protected setChannel(channel: keyof AlertDelivery, on: boolean): void {
    this.draft.update((rule) => ({ ...rule, delivery: { ...rule.delivery, [channel]: on } }));
  }

  /** Écrit un champ numérique du type courant. `null` = champ vidé → plancher. */
  protected setNumber(field: NumericField, value: number | null, floor: number): void {
    this.patch((params) => ({ ...params, [field]: atLeast(value, floor) }));
  }

  protected setBoolean(field: BooleanField, on: boolean): void {
    this.patch((params) => ({ ...params, [field]: on }));
  }

  protected setDirection(direction: string): void {
    if (isDirection(direction)) {
      this.patch((params) => ({ ...params, direction }));
    }
  }

  protected setTiers(field: TierField, tiers: AlertThresholdTier[]): void {
    this.patch((params) => ({ ...params, [field]: tiers }));
  }

  protected submit(): void {
    this.save.emit(this.draft());
  }

  protected reset(): void {
    const view = this.rule();
    this.draft.set({ enabled: view.enabled, params: view.params, delivery: view.delivery });
  }

  /**
   * Applique une retouche aux paramètres, puis **re-borne** ce qui dépend d'un
   * autre champ. Un seul point de passage : sans lui, chaque champ devait se
   * souvenir des invariants de ses voisins.
   */
  private patch(edit: (params: AlertParams) => AlertParams): void {
    this.draft.update((rule) => ({ ...rule, params: reconciled(edit(rule.params)) }));
  }
}

type NumericField =
  'minPreviousOrders' | 'baselineOrders' | 'minBaselineOrders' | 'windowDays' | 'minSampleLines';
type BooleanField =
  'onlyWithoutAccountBaseline' | 'watchQuantities' | 'watchRecurrence' | 'watchFulfillment';
type TierField = 'riseTiers' | 'dropTiers';

/** Les paramètres si le type courant est celui demandé, sinon `null`. */
function paramsOf(rule: AlertRule, kind: 'product.first_order'): FirstOrderParams | null;
function paramsOf(rule: AlertRule, kind: 'product.quantity_drift'): QuantityDriftParams | null;
function paramsOf(rule: AlertRule, kind: 'product.quantity_outlier'): QuantityOutlierParams | null;
function paramsOf(rule: AlertRule, kind: 'subscription.changed'): SubscriptionChangedParams | null;
function paramsOf(rule: AlertRule, kind: AlertParams['kind']): AlertParams | null {
  return rule.params.kind === kind ? rule.params : null;
}

function atLeast(value: number | null, min: number): number {
  return value !== null && Number.isFinite(value) ? Math.max(min, Math.trunc(value)) : min;
}

/**
 * Le serveur refuse `minBaselineOrders > baselineOrders`. On le tient **ici**
 * plutôt que de laisser partir une requête qui reviendra en 400 : la règle est la
 * même, mais l'écran n'a aucune raison de la faire découvrir par un échec.
 */
function reconciled(params: AlertParams): AlertParams {
  if (params.kind !== 'product.quantity_drift') {
    return params;
  }
  return {
    ...params,
    minBaselineOrders: Math.min(params.minBaselineOrders, params.baselineOrders),
  };
}

function isDirection(value: string): value is DriftDirection {
  return DIRECTIONS.some((option) => option.value === value);
}
