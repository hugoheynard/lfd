import { parisClock } from './resupply-labels';

/**
 * Ce qu'un écran sait du chemin d'un réassort envoyé — la forme commune de
 * `ResupplyReceptionView` (le comptoir) et de `SiteResupplyView` (Prod
 * manager). Chaque instant est `null` tant que l'étape n'est pas atteinte.
 */
export interface ResupplyTrack {
  readonly placedAt: string;
  readonly placedBy: string | null;
  readonly launchedAt: string | null;
  readonly launchedBy: string | null;
  readonly departedAt: string | null;
  readonly departedBy: string | null;
  readonly arrivedAt: string | null;
  readonly arrivedBy: string | null;
}

export type ResupplyStepKey = 'sent' | 'launched' | 'departed' | 'arrived';

/** Une étape atteinte : son mot, la clé de couleur fold, et « 08:30 · Léa ». */
export interface ResupplyStep {
  readonly key: ResupplyStepKey;
  readonly label: string;
  readonly status: string;
  readonly detail: string;
}

const STEPS: readonly {
  readonly key: ResupplyStepKey;
  readonly label: string;
  readonly status: string;
  readonly at: (track: ResupplyTrack) => string | null;
  readonly by: (track: ResupplyTrack) => string | null;
}[] = [
  {
    key: 'sent',
    label: 'Envoyé',
    status: 'coming-soon',
    at: (t) => t.placedAt,
    by: (t) => t.placedBy,
  },
  {
    key: 'launched',
    label: 'Lancé',
    status: 'in-progress',
    at: (t) => t.launchedAt,
    by: (t) => t.launchedBy,
  },
  {
    key: 'departed',
    label: 'Parti',
    status: 'in-progress',
    at: (t) => t.departedAt,
    by: (t) => t.departedBy,
  },
  {
    key: 'arrived',
    label: 'Arrivé',
    status: 'pending',
    at: (t) => t.arrivedAt,
    by: (t) => t.arrivedBy,
  },
];

/**
 * Les étapes ATTEINTES d'un réassort, dans l'ordre Envoyé → Lancé → Parti →
 * Arrivé (R4d, `reassort-boutiques/plan-au-plus-tot.md` §1). Une étape qui
 * ne s'applique pas — « Lancé » pour un « pour demain », « Parti » pour un
 * point servi sur place — n'est simplement jamais atteinte. Un affichage :
 * aucune n'ouvre ni ne ferme un geste.
 */
export function resupplySteps(track: ResupplyTrack): readonly ResupplyStep[] {
  return STEPS.flatMap((step) => {
    const at = step.at(track);
    if (at === null) {
      return [];
    }
    const by = step.by(track);
    const detail = by === null ? parisClock(at) : `${parisClock(at)} · ${by}`;
    return [{ key: step.key, label: step.label, status: step.status, detail }];
  });
}
