import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type {
  StaffSuggestionChoicesView,
  StaffSuggestionResultRow,
  StaffSuggestionRuleAlert,
  StaffSuggestionRuleView,
} from '@lfd/contracts';
import { FoldBadgeComponent, FoldButtonComponent, FoldInlineConfirmComponent } from 'fold-ng';

import { parisToday } from '../../shared/paris-today';
import { ALERT_BADGES, alertLines } from '../suggestion-alerts';
import type { SuggestionGesture } from '../suggestion-gesture';
import { defaultCardTitle } from '../suggestion-preview';
import { addRateLabel, revenueLabel } from '../suggestion-results';
import { ruleSummary, STATE_BADGES, stateOf } from '../suggestion-summary';

/**
 * **Une règle dans la liste** : sa phrase d'abord (la ligne principale), son
 * état, son alerte (RS10) et la raison en clair, ses chiffres, et les gestes
 * que le droit d'écrire ouvre. Elle ne fait rien elle-même : elle dit le geste,
 * la page l'exécute.
 *
 * « Dupliquer » (RS9) reste offert sur une archivée : on décline une saison
 * retirée sans la ressusciter.
 */
@Component({
  // Un `li` : la ligne est un élément de la liste, pas un enfant de plus.
  selector: 'li[app-suggestion-rule-row]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, FoldInlineConfirmComponent],
  templateUrl: './suggestion-rule-row.html',
  styleUrl: './suggestion-rule-row.scss',
})
export class SuggestionRuleRow {
  readonly rule = input.required<StaffSuggestionRuleView>();
  readonly choices = input<StaffSuggestionChoicesView | null>(null);
  readonly alert = input<StaffSuggestionRuleAlert | null>(null);
  readonly counts = input<StaffSuggestionResultRow | null>(null);
  readonly canWrite = input(false);
  /** L'id de la règle dont un geste est en vol ; `null` : aucun. */
  readonly pending = input<string | null>(null);

  readonly gesture = output<SuggestionGesture>();

  protected readonly summary = computed(() => ruleSummary(this.rule(), this.choices()));
  protected readonly phrase = computed(
    () => `« ${this.rule().phrase?.fr ?? defaultCardTitle(this.rule().placement)} »`,
  );
  protected readonly badge = computed(() => STATE_BADGES[stateOf(this.rule(), parisToday())]);
  protected readonly alertBadge = computed(() => {
    const alert = this.alert();
    return alert === null ? null : ALERT_BADGES[alert.severity];
  });
  protected readonly alertTexts = computed(() => {
    const alert = this.alert();
    return alert === null ? [] : alertLines(alert, this.choices());
  });
  protected readonly archived = computed(() => this.rule().archivedAt !== null);
  protected readonly addRateLabel = addRateLabel;
  protected readonly revenueLabel = revenueLabel;

  protected ask(kind: SuggestionGesture['kind']): void {
    this.gesture.emit({ kind, rule: this.rule() });
  }
}
