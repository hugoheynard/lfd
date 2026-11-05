import { PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
} from 'fold-ng';

import type { CacheOutcomeView, CacheReport } from '@lfd/ops-contract';

/** Les noms des caches que l'API compte (C5) ; un nom inconnu s'affiche tel quel. */
const CACHE_LABEL: Readonly<Record<string, string>> = {
  principal: 'Principal (qui est le client)',
  'shelf.read': "Rayon d'une société — lecture",
  'shelf.store': "Rayon d'une société — rangement",
  'shelf.public': 'Rayon public',
  'pricing.materials': 'Matériaux de prix',
};

/** Les mots des producteurs ; une issue inconnue s'affiche telle quelle. */
const OUTCOME_LABEL: Readonly<Record<string, string>> = {
  memory: 'mémoire',
  joined: 'lecture partagée',
  'resolved-stamp': 'relu : estampille changée',
  'resolved-absent': 'relu : absent',
  'resolved-expired': 'relu : expiré',
  hit: 'servi',
  miss: 'manqué',
  stamp_moved: 'estampille changée',
};

/** Les issues où le cache a rendu service sans retourner en base. */
const GOOD_OUTCOMES: ReadonlySet<string> = new Set(['memory', 'hit', 'cacheable', 'stored']);

/** Une issue prête à afficher ; `featured` marque la première issue « bonne » du cache. */
export interface OutcomeLine {
  readonly label: string;
  readonly count: number;
  readonly share: number;
  readonly featured: boolean;
}

/** Un cache prêt à afficher. */
export interface CacheLine {
  readonly key: string;
  readonly label: string;
  readonly total: number;
  readonly windowMinutes: number;
  readonly outcomes: readonly OutcomeLine[];
}

function toLines(outcomes: readonly CacheOutcomeView[]): OutcomeLine[] {
  const featuredIndex = outcomes.findIndex((o) => GOOD_OUTCOMES.has(o.outcome));
  return outcomes.map((o, index) => ({
    label: OUTCOME_LABEL[o.outcome] ?? o.outcome,
    count: o.count,
    share: o.share,
    featured: index === featuredIndex,
  }));
}

/**
 * Comment les caches de l'API ont servi (C5) : par cache, le total sur la
 * fenêtre et la part de chaque issue. La part vient du serveur, au millième :
 * on l'affiche, on ne la recalcule pas.
 */
@Component({
  selector: 'app-cache-outcomes',
  imports: [
    PercentPipe,
    FoldBadgeComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
  ],
  templateUrl: './cache-outcomes.html',
  styleUrl: './cache-outcomes.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CacheOutcomes {
  /** Le relevé servi, ou `undefined` quand l'API ne l'envoie pas. */
  readonly caches = input<readonly CacheReport[] | undefined>(undefined);

  protected readonly lines = computed<readonly CacheLine[]>(() =>
    (this.caches() ?? []).map((report) => ({
      key: report.cache,
      label: CACHE_LABEL[report.cache] ?? report.cache,
      total: report.total,
      windowMinutes: report.windowMinutes,
      outcomes: toLines(report.outcomes),
    })),
  );
}
