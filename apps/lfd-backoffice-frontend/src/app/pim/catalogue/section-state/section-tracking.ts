import { signal, type WritableSignal } from '@angular/core';

/** L'état momentané d'un enregistrement — absent quand il ne s'est rien passé. */
export type SaveState = 'saving' | 'saved' | 'error';

/**
 * Le suivi « qu'est-ce qui a changé, et où en est l'enregistrement ».
 *
 * Extrait du store des familles parce qu'il n'a rien de métier : il compare des
 * EMPREINTES et retient un état par clé. Le store garde ce que lui seul sait —
 * fabriquer l'empreinte d'une section, et la restaurer.
 *
 * Une référence par section, et non un « propre / sale » global : sans elle,
 * « modifié » ne veut rien dire à l'échelle d'une carte, et « annuler » n'a
 * nulle part où revenir.
 */
export interface SectionTracking<TSection extends string> {
  /** L'empreinte enregistrée de chaque section. */
  readonly baseline: WritableSignal<Partial<Record<TSection, string>>>;
  /** Repose la référence de TOUTES les sections — après un chargement ou un
   *  enregistrement réussi. */
  rebase(sections: readonly TSection[]): void;
  isDirty(section: TSection): boolean;
  /** La valeur de référence d'une section, ou `undefined` si jamais posée. */
  saved(section: TSection): string | undefined;
  mark(section: TSection, state: SaveState): void;
  statusText(section: TSection): string;
}

export function sectionTracking<TSection extends string>(
  snapshot: (section: TSection) => string,
): SectionTracking<TSection> {
  const baseline = signal<Partial<Record<TSection, string>>>({});
  const statusMap = signal<Partial<Record<TSection, SaveState>>>({});

  return {
    baseline,
    rebase(sections) {
      // Une boucle et non `Object.fromEntries` : celui-ci rend un index de
      // `string`, qu'il faudrait convertir. Le typage a raison, c'est la
      // construction qui doit être explicite.
      const next: Partial<Record<TSection, string>> = {};
      for (const section of sections) {
        next[section] = snapshot(section);
      }
      baseline.set(next);
    },
    isDirty(section) {
      const base = baseline()[section];
      return base !== undefined && base !== snapshot(section);
    },
    saved(section) {
      return baseline()[section];
    },
    mark(section, state) {
      statusMap.update((current) => ({ ...current, [section]: state }));
    },
    statusText(section) {
      switch (statusMap()[section]) {
        case 'saving':
          return 'Enregistrement…';
        case 'saved':
          return 'Enregistré ✓';
        case 'error':
          return 'Échec';
        default:
          return '';
      }
    },
  };
}
