import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import type {
  StaffSuggestionChoicesView,
  StaffSuggestionResultRow,
  StaffSuggestionRuleAlert,
  StaffSuggestionRuleView,
} from '@lfd/contracts';
import {
  FoldCardComponent,
  FoldDisclosureComponent,
  FoldElementTitleComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import { parisToday } from '../../shared/paris-today';
import {
  ALERT_FILTER_ALL,
  ALERT_FILTER_TO_FIX,
  alertFilterOf,
  type AlertFilter,
} from '../suggestion-alerts';
import type { SuggestionGesture } from '../suggestion-gesture';
import { groupsOf } from '../suggestion-groups';
import { SuggestionRuleRow } from '../suggestion-rule-row/suggestion-rule-row';

/**
 * **La liste des règles, regroupée** (RS9) — « À venir », « En cours »,
 * « Finies », puis « Coupées » et « Archivées » repliées, chacune avec son
 * compte. « À corriger » (RS10) ne garde que les règles signalées ; une
 * archivée n'est jamais signalée, son groupe reste donc tel quel.
 */
@Component({
  selector: 'app-suggestion-rule-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldCardComponent,
    FoldDisclosureComponent,
    FoldElementTitleComponent,
    FoldViewToggleComponent,
    NgTemplateOutlet,
    SuggestionRuleRow,
  ],
  templateUrl: './suggestion-rule-list.html',
  styleUrl: './suggestion-rule-list.scss',
})
export class SuggestionRuleList {
  readonly rules = input.required<readonly StaffSuggestionRuleView[]>();
  readonly choices = input<StaffSuggestionChoicesView | null>(null);
  /** `null` : pas (ou pas encore) lues — le filtre ne paraît pas. */
  readonly alerts = input<ReadonlyMap<string, StaffSuggestionRuleAlert> | null>(null);
  readonly counters = input<ReadonlyMap<string, StaffSuggestionResultRow> | null>(null);
  readonly canWrite = input(false);
  readonly pending = input<string | null>(null);

  readonly gesture = output<SuggestionGesture>();

  /** « Toutes » ou « À corriger » — la tête de la liste (RS10). */
  protected readonly alertFilter = signal<AlertFilter>(ALERT_FILTER_ALL);
  protected readonly alertFilterOptions = computed(() => [
    { value: ALERT_FILTER_ALL, label: 'Toutes' },
    { value: ALERT_FILTER_TO_FIX, label: `À corriger (${String(this.alerts()?.size ?? 0)})` },
  ]);
  /** Les règles listées : à corriger seulement quand le filtre le demande. */
  private readonly listed = computed(() => {
    const alerts = this.alerts();
    return this.alertFilter() === ALERT_FILTER_TO_FIX && alerts !== null
      ? this.rules().filter((rule) => rule.archivedAt !== null || alerts.has(rule.id))
      : this.rules();
  });
  protected readonly groups = computed(() => groupsOf(this.listed(), parisToday()));
  protected readonly nothingToFix = computed(
    () =>
      this.alertFilter() === ALERT_FILTER_TO_FIX &&
      this.listed().every((rule) => rule.archivedAt !== null),
  );

  protected readonly alertOf = (rule: StaffSuggestionRuleView): StaffSuggestionRuleAlert | null =>
    this.alerts()?.get(rule.id) ?? null;
  protected readonly countsOf = (rule: StaffSuggestionRuleView): StaffSuggestionResultRow | null =>
    this.counters()?.get(rule.id) ?? null;

  protected chooseAlertFilter(value: string): void {
    this.alertFilter.set(alertFilterOf(value) ?? ALERT_FILTER_ALL);
  }
}
