import { PercentPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  FoldIconComponent,
} from 'fold-ng';

import type { CacheCallReport, CacheOutcomeView, CacheReport } from '@lfd/ops-contract';

/** Les noms des caches que l'API compte (C5) ; un nom inconnu s'affiche tel quel. */
const CACHE_LABEL: Readonly<Record<string, string>> = {
  principal: 'Principal (qui est le client)',
  'shelf.read': "Rayon d'une société — lecture",
  'shelf.store': "Rayon d'une société — rangement",
  'shelf.public': 'Rayon public',
  'pricing.materials': 'Matériaux de prix',
  day_contents: 'Écrans de journée (objet des journées)',
};

/** Les magasins appelés par le réseau ; un magasin inconnu s'affiche tel quel. */
const STORE_LABEL: Readonly<Record<string, string>> = {
  shelf_cache: 'Objet des rayons',
  day_versions: 'Objet des journées — numéros',
  versioned_contents: 'Objet des journées — contenus versionnés',
  day_contents: 'Objet des journées — écrans de journée',
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
  cacheable: 'gardé par Cloudflare',
  stored: 'rangé',
  stale_refused: 'refusé : périmé',
  not_kept: 'non gardé',
  fallback_timeout: 'délai dépassé',
  fallback: 'repli sans réponse',
  unreadable: 'illisible',
};

/**
 * Ce que veut dire chaque issue, en une phrase pour l'équipe (Hugo,
 * 2026-11-05 : « c'est pas clair la lecture des datas »). Une issue inconnue
 * n'a pas d'explication.
 */
const OUTCOME_HINT: Readonly<Record<string, string>> = {
  memory: 'trouvé en mémoire, sans aller en base (~10 ms)',
  joined: 'deux appels du même client au même instant : une seule lecture en base pour les deux',
  'resolved-absent':
    'rien en mémoire pour ce client (souvent : premier appel après un redémarrage) — relu en base',
  'resolved-stamp': 'un compte, une société ou un rattachement a changé : relu en base',
  'resolved-expired': 'gardé plus de 10 minutes : relu en base par prudence',
  recorded: 'le jeton apportait une preuve neuve (adresse vérifiée) : enregistrée, puis relu',
  'no-stamp': "l'estampille manquait en base : rien n'est gardé, relu à chaque appel",
  hit: 'servi depuis le cache',
  miss: 'absent du cache : recalculé',
  stamp_moved: 'un prix a changé depuis : recalculé',
  cacheable: 'la réponse a pu être gardée par Cloudflare',
  stored: 'rangé, prêt pour les visites suivantes',
  stale_refused: 'une version plus récente était déjà rangée : rien écrasé',
  not_kept: 'non gardé (rien à ranger)',
  fallback_timeout: "le cache n'a pas répondu à temps : recalculé sans lui",
  fallback:
    "l'objet n'a pas répondu (délai, erreur ou disjoncteur ouvert) : relu en base — la raison est dans l'onglet Cache",
  unreadable: "la charge relue n'était pas reconnue : relu en base",
};

/** Les issues où le cache a rendu service sans retourner en base. */
const GOOD_OUTCOMES: ReadonlySet<string> = new Set(['memory', 'hit', 'cacheable', 'stored']);

/** Les opérations sur l'objet des rayons ; une opération inconnue s'affiche telle quelle. */
const OPERATION_LABEL: Readonly<Record<string, string>> = {
  read: 'lecture',
  store: 'rangement',
  erase: 'effacement',
};

/** Une opération sur un magasin de cache, prête à afficher. */
export interface CallLine {
  readonly key: string;
  readonly label: string;
  readonly calls: number;
  readonly late: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly lateFinishP95Ms: number | null;
}

/** Une issue prête à afficher ; `featured` marque la première issue « bonne » du cache. */
export interface OutcomeLine {
  readonly label: string;
  readonly hint: string | null;
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
  /** La part servie sans retourner en base — la somme des parts « bonnes » servies par le serveur. */
  readonly servedShare: number;
  readonly outcomes: readonly OutcomeLine[];
}

function toLines(outcomes: readonly CacheOutcomeView[]): OutcomeLine[] {
  const featuredIndex = outcomes.findIndex((o) => GOOD_OUTCOMES.has(o.outcome));
  return outcomes.map((o, index) => ({
    label: OUTCOME_LABEL[o.outcome] ?? o.outcome,
    hint: OUTCOME_HINT[o.outcome] ?? null,
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

  /** La mesure des appels à l'objet des rayons, ou `undefined` quand l'API ne l'envoie pas. */
  readonly calls = input<readonly CacheCallReport[] | undefined>(undefined);

  protected readonly callLines = computed<readonly CallLine[]>(() =>
    (this.calls() ?? []).map((call) => ({
      key: `${call.store}:${call.operation}`,
      label: `${STORE_LABEL[call.store] ?? call.store} — ${OPERATION_LABEL[call.operation] ?? call.operation}`,
      calls: call.calls,
      late: call.late,
      p50Ms: call.p50Ms,
      p95Ms: call.p95Ms,
      lateFinishP95Ms: call.lateFinishP95Ms,
    })),
  );

  protected readonly lines = computed<readonly CacheLine[]>(() =>
    (this.caches() ?? []).map((report) => ({
      key: report.cache,
      label: CACHE_LABEL[report.cache] ?? report.cache,
      total: report.total,
      windowMinutes: report.windowMinutes,
      servedShare: report.outcomes
        .filter((o) => GOOD_OUTCOMES.has(o.outcome))
        .reduce((sum, o) => sum + o.share, 0),
      outcomes: toLines(report.outcomes),
    })),
  );
}
