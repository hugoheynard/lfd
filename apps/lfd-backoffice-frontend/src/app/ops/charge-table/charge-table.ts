import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { TrafficWindow } from '@lfd/ops-contract';

/** Ce qu'on montre : les appels qui pèsent, pas l'inventaire des routes. */
const SHOWN = 12;

/** Une ligne du tableau, prête à rendre. */
interface Row {
  readonly key: string;
  readonly node: string;
  readonly surface: string;
  readonly requests: number;
  /** Part de la charge totale, 0..1 — la barre derrière la ligne. */
  readonly share: number;
  readonly p95Ms: number;
  readonly failures: number;
  /** Vrai si cette surface est nettement plus lente que la médiane des autres. */
  readonly slow: boolean;
}

/**
 * **Quelles requêtes prennent la charge.** Le complément indispensable de la
 * carte : celle-ci dit qu'une brique peine, celui-ci dit *sur quoi*.
 *
 * Trié par volume, parce que c'est la question posée. Mais le volume seul
 * désigne mal le coupable — une route appelée dix fois et lente dix secondes
 * pèse plus qu'une route appelée mille fois en cinq millisecondes. D'où la
 * marque `slow`, qui remonte à l'œil ce que le tri ne remonte pas.
 *
 * **Ce que ce tableau ne peut pas dire**, et il vaut mieux le savoir en le
 * lisant : la surface s'arrête à deux segments, et tout segment porteur d'un
 * chiffre est masqué. On voit `admin/companies`, jamais
 * `admin/companies/cmsz…/contacts`. C'est la décision du J1 — un identifiant en
 * dimension, c'est la cardinalité qui explose et de la donnée client déposée
 * dehors.
 */
@Component({
  selector: 'app-charge-table',
  standalone: true,
  imports: [DecimalPipe],
  templateUrl: './charge-table.html',
  styleUrl: './charge-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChargeTable {
  readonly windows = input.required<readonly TrafficWindow[]>();

  private readonly all = computed<readonly Row[]>(() => {
    const rows = this.windows().flatMap((window) =>
      (window.surfaces ?? []).map((surface) => ({ window, surface })),
    );
    const total = rows.reduce((sum, entry) => sum + entry.surface.requests, 0);
    const slowFloor = medianP95(rows.map((entry) => entry.surface.p95Ms)) * 3;

    return rows
      .map(({ window, surface }) => ({
        key: `${window.node}·${surface.surface}`,
        node: window.node,
        surface: surface.surface,
        requests: surface.requests,
        share: total === 0 ? 0 : surface.requests / total,
        p95Ms: surface.p95Ms,
        failures: surface.serverErrors + surface.gatewayFaults,
        slow: surface.p95Ms > slowFloor,
      }))
      .sort((left, right) => right.requests - left.requests);
  });

  protected readonly rows = computed(() => this.all().slice(0, SHOWN));

  /** Combien de surfaces sont hors du tableau — jamais tronqué en silence. */
  protected readonly hidden = computed(() => Math.max(0, this.all().length - SHOWN));

  protected readonly hasNone = computed(() => this.all().length === 0);
}

/** La médiane des latences observées — le repère à partir duquel « lent » a un sens. */
function medianP95(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}
