import type { ProductionWorksheetView, WorkshopGroup, WorkshopLine } from '@lfd/contracts';

import { clockLabel } from './supervision-labels';

/**
 * **La colonne 1 — l'unité est le produit.** Une carte par rayon de la fiche
 * d'atelier, telle que le serveur la compte (`doneCount`, `lineCount`,
 * `remainingUnits`) : rien n'est recompté ici.
 *
 * L'état **Bloqué** de la maquette n'a pas de donnée — aucune table n'enregistre
 * une rupture (plan §7). Il n'est donc pas un état possible de ce type.
 */
export type ShelfState = 'done' | 'in_progress' | 'not_started';

export interface ShelfCard {
  readonly key: string;
  readonly label: string;
  readonly state: ShelfState;
  readonly doneCount: number;
  readonly lineCount: number;
  readonly remainingUnits: number;
  readonly totalUnits: number;
  /** Les lignes encore à sortir, dans l'ordre de la fiche — sans case à cocher. */
  readonly pending: readonly WorkshopLine[];
}

export interface PreparationBoard {
  /** Ce qui reste au four : en cours d'abord, puis pas commencés, dans l'ordre de la vitrine. */
  readonly open: readonly ShelfCard[];
  /** Les rayons finis, repliés en bas. */
  readonly finished: readonly ShelfCard[];
  /** « terminés à 6 h 10 » — la dernière coche des rayons finis, `null` sans heure lisible. */
  readonly finishedAt: string | null;
  /** Le compteur d'en-tête : lignes pas encore faites, tous rayons confondus. */
  readonly openLines: number;
  readonly shelvesKnown: boolean;
}

/** Un rayon sans ligne n'a rien à faire : il est fini, pas « pas commencé ». */
export function shelfStateOf(group: WorkshopGroup): ShelfState {
  if (group.doneCount >= group.lineCount) {
    return 'done';
  }
  return group.doneCount === 0 ? 'not_started' : 'in_progress';
}

function cardOf(group: WorkshopGroup): ShelfCard {
  return {
    key: group.key,
    label: group.label,
    state: shelfStateOf(group),
    doneCount: group.doneCount,
    lineCount: group.lineCount,
    remainingUnits: group.remainingUnits,
    totalUnits: group.totalUnits,
    pending: group.pending,
  };
}

/** La coche la plus tardive des rayons finis — comparée en instants, pas en chaînes. */
function lastDoneAt(groups: readonly WorkshopGroup[]): string | null {
  let latest: { iso: string; at: number } | null = null;
  for (const line of groups.flatMap((group) => group.done)) {
    const at = line.doneAt === null ? Number.NaN : new Date(line.doneAt).getTime();
    if (!Number.isNaN(at) && (latest === null || at > latest.at)) {
      latest = { iso: line.doneAt ?? '', at };
    }
  }
  return latest === null ? null : clockLabel(latest.iso);
}

export function preparationBoard(view: ProductionWorksheetView): PreparationBoard {
  const cards = view.groups.map(cardOf);
  const finishedGroups = view.groups.filter((group) => shelfStateOf(group) === 'done');
  return {
    open: [
      ...cards.filter((card) => card.state === 'in_progress'),
      ...cards.filter((card) => card.state === 'not_started'),
    ],
    finished: cards.filter((card) => card.state === 'done'),
    finishedAt: lastDoneAt(finishedGroups),
    openLines: view.groups.reduce((sum, group) => sum + group.lineCount - group.doneCount, 0),
    shelvesKnown: view.shelvesKnown,
  };
}
