import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DEFAULT_AUDIENCE_PERIOD, type AudiencePeriod, type AudiencesView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
  FoldViewToggleComponent,
} from 'fold-ng';

import {
  anonymityHelp,
  AUDIENCE_PERIOD_OPTIONS,
  audiencePeriodOf,
  DIMENSION_TEXTS,
} from '../audience-format';
import { AudienceSegmentCard } from '../audience-segment-card/audience-segment-card';
import { AudiencesService } from '../audiences.service';

type LoadState = 'loading' | 'error' | 'ready';

/**
 * **Analytics › Audiences** — la clientèle décrite par ce qu'elle fait, en
 * segments agrégés (`documentation/recommandation-produit/plan-audiences.md`,
 * A1), sous `b2b_growth:read`, le droit de la croissance qu'elle côtoie.
 *
 * Une carte par coupe, une ligne par case. Le seuil d'anonymat est appliqué
 * par le serveur ; l'écran ne fait que le dire, et le rappeler en tête.
 * Changer de période recharge tout : les coupes se lisent ensemble.
 */
@Component({
  selector: 'app-audiences-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AudienceSegmentCard,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    FoldViewToggleComponent,
  ],
  templateUrl: './audiences-page.html',
  styleUrl: './audiences-page.scss',
})
export class AudiencesPage {
  private readonly api = inject(AudiencesService);

  protected readonly periodOptions = AUDIENCE_PERIOD_OPTIONS;
  protected readonly texts = DIMENSION_TEXTS;
  protected readonly anonymityHelp = anonymityHelp;

  protected readonly period = signal<AudiencePeriod>(DEFAULT_AUDIENCE_PERIOD);
  protected readonly state = signal<LoadState>('loading');
  protected readonly view = signal<AudiencesView | null>(null);

  constructor() {
    void this.load();
  }

  /** Recharge les coupes de la période ; une panne garde l'écran dans l'état d'erreur. */
  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      this.view.set(await this.api.read(this.period()));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  protected choosePeriod(value: string): void {
    const days = audiencePeriodOf(value);
    if (days === null || days === this.period()) {
      return;
    }
    this.period.set(days);
    void this.load();
  }
}
