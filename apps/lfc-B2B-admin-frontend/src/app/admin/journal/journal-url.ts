import type { ParamMap, Params } from '@angular/router';
import type { ActivityModule } from '@lfd/contracts';

import { MODULE_LABELS } from './journal-line';

/**
 * Les filtres du journal qui **voyagent dans l'adresse** : ceux qu'une fiche
 * pose pour y mener (« Voir son activité »), et qu'un lien partagé doit rendre.
 *
 * Des **identifiants** seulement. La recherche libre `q` n'y entre jamais : un
 * terme cherché peut être un nom, et l'URL voyage dans les journaux de la
 * passerelle (plan `journalisation/plan-journal-d-activite.md`, lot 3). La
 * période non plus : elle se recalcule depuis l'instant de lecture, et une
 * adresse ne doit pas dire autre chose le lendemain.
 *
 * `''` vaut « pas de filtre » — ce que la liste des modules écrit déjà.
 */
export interface JournalUrlFilters {
  readonly module: ActivityModule | '';
  readonly actorId: string;
  readonly subjectType: string;
  readonly subjectId: string;
}

export const NO_URL_FILTERS: JournalUrlFilters = {
  module: '',
  actorId: '',
  subjectType: '',
  subjectId: '',
};

/** Les clés que l'écran lit, dans l'ordre où il les écrit. */
const URL_KEYS = ['module', 'actorId', 'subjectType', 'subjectId'] as const;

/** Seules les clés de `MODULE_LABELS` sont des modules. */
export function isModule(value: string): value is ActivityModule {
  return Object.hasOwn(MODULE_LABELS, value);
}

/**
 * Ce que l'adresse demande. Un module inconnu vaut « tous » : un lien périmé
 * ouvre le journal, il ne le vide pas sur un filtre que le serveur refuserait.
 */
export function readUrlFilters(params: ParamMap): JournalUrlFilters {
  const module = params.get('module') ?? '';
  return {
    module: isModule(module) ? module : '',
    actorId: params.get('actorId') ?? '',
    subjectType: params.get('subjectType') ?? '',
    subjectId: params.get('subjectId') ?? '',
  };
}

/**
 * Ce qu'on écrit dans l'adresse. Un filtre vide part à `null`, qui **retire**
 * la clé sous `queryParamsHandling: 'merge'` ; `q` aussi, toujours : une
 * adresse tapée ou collée à la main qui en porterait un en ressort nettoyée.
 */
export function toQueryParams(filters: JournalUrlFilters): Params {
  const params: Params = { q: null };
  for (const key of URL_KEYS) {
    params[key] = filters[key] === '' ? null : filters[key];
  }
  return params;
}

export function sameUrlFilters(a: JournalUrlFilters, b: JournalUrlFilters): boolean {
  return URL_KEYS.every((key) => a[key] === b[key]);
}
