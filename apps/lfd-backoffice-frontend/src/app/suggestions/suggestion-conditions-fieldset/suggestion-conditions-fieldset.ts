import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { StaffSuggestionChoicesView, StaffSuggestionPlacement, Weekday } from '@lfd/contracts';
import {
  FoldCalloutComponent,
  FoldFieldsetComponent,
  FoldInputComponent,
  FoldListboxComponent,
  FoldMultiselectComponent,
  type FoldSelectOption,
  FoldTimeComponent,
} from 'fold-ng';

import { cartOnly, type ConditionsDraft, WEEKDAY_OPTIONS } from '../suggestion-conditions';

/** La valeur de « aucune famille exclue » dans la liste. */
const NO_FAMILY = '';

/**
 * **Les conditions facultatives d'une règle** (RS8) — un encadré du panneau,
 * qui dit d'abord ce qu'elles font, avec des exemples, puis les pose. Toutes
 * se cumulent avec le reste de la règle. Le montant et la famille du panier
 * n'apparaissent qu'au panier : ailleurs, la boutique ne les connaît pas.
 */
@Component({
  selector: 'app-suggestion-conditions-fieldset',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCalloutComponent,
    FoldFieldsetComponent,
    FoldInputComponent,
    FoldListboxComponent,
    FoldMultiselectComponent,
    FoldTimeComponent,
  ],
  templateUrl: './suggestion-conditions-fieldset.html',
  styleUrl: './suggestion-conditions-fieldset.scss',
})
export class SuggestionConditionsFieldset {
  readonly conditions = input.required<ConditionsDraft>();
  readonly placement = input.required<StaffSuggestionPlacement>();
  readonly choices = input.required<StaffSuggestionChoicesView | null>();

  readonly conditionsChange = output<ConditionsDraft>();

  protected readonly weekdayOptions = WEEKDAY_OPTIONS;
  protected readonly atCart = computed(() => cartOnly(this.placement()));
  protected readonly familyOptions = computed<readonly FoldSelectOption<string>[]>(() => [
    { value: NO_FAMILY, label: 'Peu importe' },
    ...(this.choices()?.families ?? []).map((family) => ({
      value: family.id,
      label: family.name,
    })),
  ]);
  protected readonly siteOptions = computed<readonly FoldSelectOption<string>[]>(() =>
    (this.choices()?.sites ?? []).map((site) => ({ value: site.id, label: site.label })),
  );

  protected patch<K extends keyof ConditionsDraft>(key: K, value: ConditionsDraft[K]): void {
    this.conditionsChange.emit({ ...this.conditions(), [key]: value });
  }

  protected setWeekdays(days: readonly Weekday[]): void {
    this.patch('weekdays', days);
  }

  protected setSites(ids: readonly string[]): void {
    this.patch('pickupAddressIds', ids);
  }
}
