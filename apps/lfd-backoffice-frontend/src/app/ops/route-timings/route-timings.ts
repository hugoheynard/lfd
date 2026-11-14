import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import {
  FoldButtonComponent,
  FoldCardComponent,
  FoldDataTableComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
  FoldLoadingStateComponent,
  type FoldTableColumn,
  type FoldTableEmpty,
  type FoldTableTone,
} from 'fold-ng';

import type { RouteTimingFailure, RouteTimingPass, RouteTimingsReport } from '@lfd/ops-contract';

import { OpsService } from '../ops.service';

type LoadState = 'idle' | 'loading' | 'error' | 'ready';

/** Une ligne du tableau : un passage d'une route. */
interface PassRow extends RouteTimingPass {
  readonly key: string;
  readonly path: string;
}

const PASS_LABEL: Readonly<Record<1 | 2, string>> = { 1: 'Froid', 2: 'Chaud' };

const FAILURE_LABEL: Readonly<Record<RouteTimingFailure, string>> = {
  timeout: 'Délai dépassé',
  unreachable: 'Injoignable',
};

/** La durée d'une marque `Server-Timing`, ou un tiret quand la réponse ne la porte pas. */
function mark(pass: RouteTimingPass, name: string): string {
  const found = pass.marks.find((m) => m.name === name);
  return found?.durationMs == null ? '—' : `${found.durationMs} ms`;
}

function status(pass: RouteTimingPass): string {
  if (pass.failure !== null) return FAILURE_LABEL[pass.failure];
  return pass.status === null ? '—' : String(pass.status);
}

/**
 * **Vitesse des routes** (`documentation/ops/mesures-privees.md`, § 4) :
 * l'API appelle les routes publiques à travers la passerelle et rend les
 * marques `Server-Timing`. Aucun rafraîchissement automatique — chaque mesure
 * fait de vrais appels, elle ne part que sur un clic.
 */
@Component({
  selector: 'app-route-timings',
  imports: [
    FoldButtonComponent,
    FoldCardComponent,
    FoldDataTableComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldLoadingStateComponent,
  ],
  templateUrl: './route-timings.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteTimings {
  private readonly ops = inject(OpsService);

  protected readonly state = signal<LoadState>('idle');
  protected readonly report = signal<RouteTimingsReport | null>(null);
  protected readonly rows = computed<readonly PassRow[]>(() =>
    (this.report()?.routes ?? []).flatMap((route) =>
      route.passes.map((pass) => ({ ...pass, key: route.key, path: route.path })),
    ),
  );

  protected readonly columns: readonly FoldTableColumn<PassRow>[] = [
    { key: 'path', label: 'Chemin', value: (row) => row.path },
    { key: 'pass', label: 'Passage', value: (row) => PASS_LABEL[row.pass] },
    { key: 'status', label: 'Statut', value: status },
    { key: 'total', label: 'Total', numeric: true, value: (row) => `${row.totalMs} ms` },
    { key: 'app', label: 'App', numeric: true, value: (row) => mark(row, 'app') },
    { key: 'worker', label: 'Worker', numeric: true, value: (row) => mark(row, 'worker') },
    { key: 'gateway', label: 'Gateway', numeric: true, value: (row) => mark(row, 'gateway') },
    { key: 'cache', label: 'Cache', value: (row) => row.shelfCache ?? '—' },
  ];

  protected readonly nothing: FoldTableEmpty = {
    title: 'Aucune route mesurée',
    subtitle: 'L’API n’a rendu aucune route.',
  };

  protected readonly rowKey = (row: PassRow): string => `${row.key}:${row.pass}`;
  protected readonly toneOf = (row: PassRow): FoldTableTone =>
    row.failure !== null || (row.status !== null && row.status >= 500) ? 'alert' : null;

  async measure(): Promise<void> {
    this.state.set('loading');
    try {
      this.report.set(await this.ops.routeTimings());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
