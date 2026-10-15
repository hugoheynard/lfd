import { DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCardComponent,
  FoldDataTableCellDirective,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldTableTone,
} from 'fold-ng';

import type { PricingProbeReport, PricingProbeRow, PricingProbeState } from '@lfd/ops-contract';

import { OpsService } from '../ops.service';

type LoadState = 'loading' | 'error' | 'ready';

type Tone = 'success' | 'warning' | 'alert';

/** Le même rythme que la carte : la sonde est « en ce moment », comme le trafic. */
const REFRESH_MS = 15_000;

const TONE: Readonly<Record<PricingProbeState, Tone>> = {
  ok: 'success',
  attention: 'warning',
  exceeded: 'alert',
};

/** La ligne ne se teinte que hors norme : une table toute verte ne se lit plus. */
const ROW_TONE: Readonly<Record<PricingProbeState, FoldTableTone>> = {
  ok: null,
  attention: 'warning',
  exceeded: 'alert',
};

const STATE_LABEL: Readonly<Record<PricingProbeState, string>> = {
  ok: 'OK',
  attention: 'Attention',
  exceeded: 'Lent',
};

/** Les appelants, lisibles. Un appelant inconnu s'affiche tel quel plutôt que d'être deviné. */
const CALLER_LABEL: Readonly<Record<string, string>> = {
  shelf: 'Rayon',
  cart: 'Panier',
  checkout: 'Passation',
  'back-office': 'Back-office',
};

const AUDIENCE_LABEL: Readonly<Record<string, string>> = {
  pro: 'Pro',
  public: 'Public',
};

/**
 * **Temps de calcul des prix** (`documentation/ops/sonde-calcul-des-prix.md`) :
 * ce que coûte la résolution d'un lot de prix, lectures en base comprises, par
 * appelant et par audience. Le trafic dit ce que ressent le client ; cette
 * carte dit ce que coûte le calcul lui-même.
 *
 * Le jugement (`state`) vient du serveur ; l'écran ne fait que le dire.
 */
@Component({
  selector: 'app-pricing-probe',
  imports: [
    DecimalPipe,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCardComponent,
    FoldDataTableCellDirective,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './pricing-probe.html',
  styleUrl: './pricing-probe.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingProbe {
  private readonly ops = inject(OpsService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly report = signal<PricingProbeReport | null>(null);
  protected readonly rows = computed(() => this.report()?.rows ?? []);

  protected readonly columns: readonly FoldTableColumn<PricingProbeRow>[] = [
    { key: 'caller', label: 'Appelant', value: (row) => CALLER_LABEL[row.caller] ?? row.caller },
    {
      key: 'audience',
      label: 'Audience',
      value: (row) => AUDIENCE_LABEL[row.audience] ?? row.audience,
    },
    { key: 'lots', label: 'Lots', numeric: true, value: (row) => row.lots },
    { key: 'p50', label: 'Médiane', numeric: true, value: (row) => `${row.p50Ms} ms` },
    { key: 'p95', label: '95ᵉ centile', numeric: true, value: (row) => `${row.p95Ms} ms` },
    { key: 'items', label: 'Articles par lot', numeric: true, value: (row) => row.meanItems },
    { key: 'state', label: 'État' },
  ];

  protected readonly nothing: FoldTableEmpty = {
    title: 'Aucun prix calculé sur la fenêtre',
    subtitle: 'Personne n’a ouvert un rayon, un panier ou une passation sur cette instance.',
  };

  protected readonly rowKey = (row: PricingProbeRow): string => `${row.caller}:${row.audience}`;
  protected readonly toneOf = (row: PricingProbeRow): FoldTableTone => ROW_TONE[row.state];
  protected readonly tone = (state: PricingProbeState): Tone => TONE[state];
  protected readonly label = (state: PricingProbeState): string => STATE_LABEL[state];

  constructor() {
    void this.load();
    const timer = setInterval(() => void this.refresh(), REFRESH_MS);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
    });
  }

  async load(): Promise<void> {
    this.state.set('loading');
    await this.refresh();
  }

  /** Garde le dernier relevé à l'écran si la relecture échoue : ce n'est pas le calcul qui est tombé. */
  private async refresh(): Promise<void> {
    try {
      this.report.set(await this.ops.pricingProbe());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
