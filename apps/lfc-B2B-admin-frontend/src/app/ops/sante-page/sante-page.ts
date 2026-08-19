import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { FoldLoadingStateComponent } from 'fold-ng';
import type { EcosystemHealth, TrafficReport } from '@lfd/ops-contract';

import { ChargeTable } from '../charge-table/charge-table';
import { EcosystemMap } from '../ecosystem-map/ecosystem-map';
import { OpsService } from '../ops.service';

/** La fenêtre du bandeau de chiffres. Cinq minutes = « en ce moment ». */
const WINDOW_MINUTES = 5;

/** Cadence de rafraîchissement. Assez lent pour ne rien coûter, assez vif pour être « live ». */
const REFRESH_MS = 15_000;

type LoadState = 'loading' | 'ready' | 'error';

/**
 * **Santé de l'écosystème** — la carte, et les trois chiffres qui la
 * contextualisent.
 *
 * Deux choses que cet écran refuse de faire, et ce sont les deux qui décident de
 * sa crédibilité :
 *
 * 1. **Il ne juge pas.** Les statuts viennent du serveur, où la dérivation est
 *    pure et testée. Un second jeu de règles ici donnerait deux vérités sur ce
 *    que « ça va » veut dire, et c'est toujours la mauvaise qui s'affiche.
 * 2. **Il ne cache pas d'où viennent ses chiffres.** Tant qu'Analytics Engine
 *    n'est pas configuré, la réponse s'annonce comme une répétition et l'écran
 *    le DIT, en haut, en clair. Un tableau de bord branché sur un double qui se
 *    tait est pire qu'un tableau absent : on croit regarder la production.
 */
@Component({
  selector: 'app-sante-page',
  standalone: true,
  imports: [ChargeTable, DatePipe, DecimalPipe, EcosystemMap, FoldLoadingStateComponent],
  templateUrl: './sante-page.html',
  styleUrl: './sante-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SantePage {
  private readonly ops = inject(OpsService);

  protected readonly state = signal<LoadState>('loading');
  protected readonly health = signal<EcosystemHealth | null>(null);
  protected readonly traffic = signal<TrafficReport | null>(null);

  protected readonly nodes = computed(() => this.health()?.nodes ?? []);
  protected readonly windows = computed(() => this.traffic()?.windows ?? []);

  /** Vrai quand les chiffres sont fabriqués — l'aveu voyage jusqu'ici. */
  protected readonly isRehearsal = computed(() => this.traffic()?.source === 'rehearsal');

  protected readonly totals = computed(() => {
    const windows = this.windows();
    const requests = windows.reduce((sum, window) => sum + window.requests, 0);
    const failures = windows.reduce(
      (sum, window) => sum + window.serverErrors + window.gatewayFaults,
      0,
    );
    return {
      requests,
      // Les 429 n'entrent PAS dans ce taux : le throttler qui refuse est le
      // système qui fonctionne. Les compter ferait rougir l'écran au moment où
      // il devrait rassurer.
      errorRate: requests === 0 ? 0 : failures / requests,
      throttled: windows.reduce((sum, window) => sum + window.throttled, 0),
      p95Ms: Math.max(0, ...windows.map((window) => window.p95Ms)),
    };
  });

  /** Les nœuds qui ne vont PAS bien — remontés, parce qu'on vient pour eux. */
  protected readonly ailing = computed(() =>
    this.nodes().filter((node) => node.status === 'down' || node.status === 'degraded'),
  );

  constructor() {
    void this.refresh();
    const timer = setInterval(() => void this.refresh(), REFRESH_MS);
    // Sans ça, l'intervalle survit à la navigation et continue d'interroger
    // l'API depuis un écran que plus personne ne regarde.
    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
    });
  }

  protected async refresh(): Promise<void> {
    try {
      const [health, traffic] = await Promise.all([
        this.ops.health(),
        this.ops.traffic(WINDOW_MINUTES),
      ]);
      this.health.set(health);
      this.traffic.set(traffic);
      this.state.set('ready');
    } catch {
      // On garde la dernière carte connue à l'écran : une page vide ressemble à
      // une flotte éteinte, alors que c'est la LECTURE qui a échoué.
      this.state.set('error');
    }
  }
}
