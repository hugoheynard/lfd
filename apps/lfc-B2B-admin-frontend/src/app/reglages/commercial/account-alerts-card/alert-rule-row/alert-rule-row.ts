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
  type AlertRule,
  type AlertRuleView,
  type AlertThresholdTier,
  type DriftDirection,
  type QuantityDriftParams,
  type QuantityOutlierParams,
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
 * **Une règle d'alerte** dans l'écran de réglages : ce qu'elle surveille, ses
 * seuils, et qui elle prévient.
 *
 * L'édition se fait sur un **brouillon local** et ne part qu'au clic : ces
 * seuils se règlent par tâtonnement (« 50 %, non, plutôt 80 »), et enregistrer à
 * chaque frappe enverrait une salve d'écritures dont les états intermédiaires
 * n'ont jamais été voulus. Le pied d'action n'apparaît donc que si quelque chose
 * a bougé — un bouton toujours visible sur un formulaire intact invite à un
 * appel qui n'écrirait rien.
 *
 * La case « afficher au client » n'existe que pour les types qui **peuvent** se
 * montrer (`customerShowable`) : « vous n'aviez jamais pris ce produit » n'est
 * pas une erreur de saisie possible, le dire à quelqu'un qui vient de choisir ce
 * produit ne l'aide en rien.
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

  protected readonly labels = computed(() => ALERT_KIND_LABELS[this.rule().kind]);
  protected readonly customerShowable = computed(
    () => ALERT_KINDS[this.rule().kind].customerShowable,
  );

  /** Les paramètres du type « écart », ou `null` — c'est ce qui narre le template. */
  protected readonly drift = computed<QuantityDriftParams | null>(() => {
    const params = this.draft().params;
    return params.kind === 'product.quantity_drift' ? params : null;
  });

  /** Les paramètres du type « aberration produit », ou `null`. */
  protected readonly outlier = computed<QuantityOutlierParams | null>(() => {
    const params = this.draft().params;
    return params.kind === 'product.quantity_outlier' ? params : null;
  });

  /**
   * L'échelle de seuils du type courant, ou `null`. Deux types en portent une —
   * l'écart au compte et l'aberration produit — et l'éditeur est le même : seule
   * change la **référence** sur laquelle le palier se choisit, que
   * `baselineLabel` nomme.
   */
  protected readonly tiers = computed<readonly AlertThresholdTier[] | null>(() => {
    const params = this.draft().params;
    return params.kind === 'product.first_order' ? null : params.tiers;
  });

  protected readonly baselineLabel = computed(() =>
    this.draft().params.kind === 'product.quantity_drift'
      ? 'sa moyenne pour ce produit'
      : 'la norme du produit',
  );

  protected readonly firstOrderMinimum = computed<number | null>(() => {
    const params = this.draft().params;
    return params.kind === 'product.first_order' ? params.minPreviousOrders : null;
  });

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

  /** `fold-number-input` rend `null` quand le champ est vidé : on garde le plancher. */
  protected setFirstOrderMinimum(value: number | null): void {
    this.draft.update((rule) =>
      rule.params.kind === 'product.first_order'
        ? { ...rule, params: { ...rule.params, minPreviousOrders: atLeast(value, 1) } }
        : rule,
    );
  }

  protected setDriftNumber(field: DriftNumberField, value: number | null): void {
    this.draft.update((rule) =>
      rule.params.kind === 'product.quantity_drift'
        ? { ...rule, params: clampDrift({ ...rule.params, [field]: atLeast(value, 1) }) }
        : rule,
    );
  }

  protected setOutlierNumber(field: OutlierNumberField, value: number | null): void {
    this.draft.update((rule) =>
      rule.params.kind === 'product.quantity_outlier'
        ? { ...rule, params: { ...rule.params, [field]: atLeast(value, 1) } }
        : rule,
    );
  }

  protected setTiers(tiers: AlertThresholdTier[]): void {
    this.draft.update((rule) =>
      rule.params.kind === 'product.first_order'
        ? rule
        : { ...rule, params: { ...rule.params, tiers } },
    );
  }

  protected setOutlierScope(onlyWithoutAccountBaseline: boolean): void {
    this.draft.update((rule) =>
      rule.params.kind === 'product.quantity_outlier'
        ? { ...rule, params: { ...rule.params, onlyWithoutAccountBaseline } }
        : rule,
    );
  }

  protected setDirection(direction: string): void {
    this.draft.update((rule) =>
      rule.params.kind === 'product.quantity_drift' && isDirection(direction)
        ? { ...rule, params: { ...rule.params, direction } }
        : rule,
    );
  }

  protected submit(): void {
    this.save.emit(this.draft());
  }

  protected reset(): void {
    const view = this.rule();
    this.draft.set({ enabled: view.enabled, params: view.params, delivery: view.delivery });
  }
}

/** Les champs numériques du type « écart » — nommés pour éviter un `switch`. */
type DriftNumberField = 'baselineOrders' | 'minBaselineOrders';

/** Idem pour le type « aberration produit ». */
type OutlierNumberField = 'windowDays' | 'minSampleLines';

function atLeast(value: number | null, min: number): number {
  return value !== null && Number.isFinite(value) ? Math.max(min, Math.trunc(value)) : min;
}

/**
 * Le serveur refuse `minBaselineOrders > baselineOrders`. On le tient **ici**
 * plutôt que de laisser partir une requête qui reviendra en 400 : la règle est
 * la même, mais l'écran n'a aucune raison de la faire découvrir par un échec.
 */
function clampDrift(params: QuantityDriftParams): QuantityDriftParams {
  return {
    ...params,
    minBaselineOrders: Math.min(params.minBaselineOrders, params.baselineOrders),
  };
}

function isDirection(value: string): value is DriftDirection {
  return DIRECTIONS.some((option) => option.value === value);
}
