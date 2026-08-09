import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { OrderMetricsView } from '@lfd/contracts';

import { Chart, type ChartOption } from '../../../shared/chart/chart';
import { revenuePaceOption } from './revenue-pace.chart';
import { euros, revenuePace, type RevenuePace } from './revenue-pace.model';

/**
 * **L'allure du mois** — le bloc de tête du tableau de bord.
 *
 * Le chiffre géant est le cumul du mois ; la mention en dessous dit l'écart avec
 * le mois précédent **au même jour**, et la courbe montre comment on y est
 * arrivé. Trois niveaux de lecture pour un seul coup d'œil : le montant, le
 * signe, la trajectoire.
 *
 * `today` est une **entrée** et non une horloge interne : c'est la page qui la
 * pose, après le premier rendu navigateur, pour que le SSR n'invente pas une
 * date et ne fasse pas diverger l'hydratation.
 */
@Component({
  selector: 'app-revenue-pace',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Chart],
  templateUrl: './revenue-pace.html',
  styleUrl: './revenue-pace.scss',
})
export class RevenuePaceCard {
  readonly metrics = input.required<OrderMetricsView>();
  /** Le jour de référence — absent tant que le navigateur n'a pas rendu. */
  readonly today = input<Date | undefined>(undefined);

  protected readonly pace = computed<RevenuePace | null>(() => {
    const day = this.today();
    return day === undefined ? null : revenuePace(this.metrics(), day);
  });

  protected readonly total = computed<string>(() => {
    const pace = this.pace();
    return pace === null ? '—' : euros(pace.current.total);
  });

  /** « +12 % vs le mois dernier » — ou le montant seul quand le mois dernier était vide. */
  protected readonly comparison = computed<string>(() => {
    const pace = this.pace();
    if (pace === null) {
      return '';
    }
    if (pace.percent === null) {
      return 'Premier mois de chiffre — aucune comparaison possible';
    }
    const sign = pace.percent > 0 ? '+' : '';
    return `${sign}${pace.percent} % vs le mois dernier au ${pace.dayOfMonth}`;
  });

  protected readonly direction = computed<'up' | 'down' | 'flat'>(
    () => this.pace()?.direction ?? 'flat',
  );

  protected readonly option = computed<ChartOption | null>(() => {
    const pace = this.pace();
    return pace === null ? null : revenuePaceOption(pace);
  });
}
