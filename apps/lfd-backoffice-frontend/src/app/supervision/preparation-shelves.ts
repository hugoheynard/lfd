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
  /** Les lignes pas encore complètes (même entamées), dans l'ordre de la fiche. */
  readonly pending: readonly WorkshopLine[];
  /** Les lignes complètes — avec les initiales de la fournée qui les a complétées. */
  readonly done: readonly WorkshopLine[];
}

export interface PreparationBoard {
  /** Ce qui reste au four : en cours d'abord, puis pas commencés, dans l'ordre de la vitrine. */
  readonly open: readonly ShelfCard[];
  /** Les rayons finis, en bas de la colonne. */
  readonly finished: readonly ShelfCard[];
  /** « terminés à 6 h 10 » — la fournée la plus tardive qui a complété une ligne, `null` sans heure lisible. */
  readonly finishedAt: string | null;
  /** Le compteur d'en-tête : lignes pas encore faites, tous rayons confondus. */
  readonly openLines: number;
  readonly shelvesKnown: boolean;
}

/**
 * Un rayon sans ligne n'a rien à faire : il est fini, pas « pas commencé ».
 *
 * « Commencé » se lit aux PIÈCES sorties (`doneUnits`), pas aux lignes
 * complètes : depuis les fournées, 96 croissants sur 200 sortis ne complètent
 * aucune ligne, et le rayon n'est pas pour autant « pas commencé ».
 */
export function shelfStateOf(group: WorkshopGroup): ShelfState {
  if (group.doneCount >= group.lineCount) {
    return 'done';
  }
  return group.doneUnits === 0 ? 'not_started' : 'in_progress';
}

/** La barre d'une ligne : ce qui est sorti sur ce qui est au compte. */
export interface LineProgress {
  /** Borné à la quantité : le surplus ne remplit pas la barre, il se dit à côté. */
  readonly value: number;
  readonly max: number;
  readonly label: string;
  /** « +4 » — `null` quand rien n'est sorti en trop. */
  readonly surplus: string | null;
  readonly tone: 'success' | 'warning' | 'accent';
}

/**
 * La **barre par produit** (Hugo, 2026-09-28) : `produced / quantity`, telle
 * que le serveur la compte. Un surplus est un écart qui se montre (décision 2
 * des fournées), jamais un stock : il ne remplit pas la barre.
 */
export function lineProgressOf(line: WorkshopLine): LineProgress {
  const max = Math.max(line.quantity, 1);
  let tone: LineProgress['tone'] = 'accent';
  if (line.done) {
    tone = 'success';
  } else if (line.produced > 0) {
    tone = 'warning';
  }
  return {
    value: Math.min(line.produced, line.quantity),
    max,
    label: `${String(line.produced)} / ${String(line.quantity)} sorties`,
    surplus: line.surplus > 0 ? `+${String(line.surplus)}` : null,
    tone,
  };
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
    done: group.done,
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
