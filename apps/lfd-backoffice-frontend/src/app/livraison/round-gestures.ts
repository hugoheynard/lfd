import {
  movedOrder,
  type OrderLists,
  roundLabel,
  shiftedOrder,
  sortedByWindow,
} from './delivery-rounds';
import type { StopShift } from './round-column/round-column';
import { type Board, type BoardDrop, POOL_KEY } from './rounds-board-model';
import { listsOf } from './rounds-board-lists';

/**
 * Ce que devient un geste du tableau — glisser, ↑ ↓, retirer, ranger : les
 * listes visées et le texte du bandeau « Annuler », ou un refus à dire.
 * `null` : le geste ne change rien. Sorti de `RoundsPage` en fonctions pures :
 * la page décide seulement si elle écrit ou recompose l'aperçu.
 */
export type GestureOutcome =
  | { readonly kind: 'relayout'; readonly lists: OrderLists; readonly text: string }
  | { readonly kind: 'refused'; readonly text: string };

/** Glisser, « Mettre dans », un dépôt sur un onglet — une commande change de place. */
export function dropOutcome(board: Board, drop: BoardDrop): GestureOutcome | null {
  const target = board.rounds.find((round) => round.key === drop.to.list);
  const source = board.rounds.find((round) => round.key === drop.from.list);
  if (target?.frozen === true) {
    return { kind: 'refused', text: `${roundLabel(target)} est partie : rien ne s’y dépose.` };
  }
  if (source?.frozen === true) {
    return null;
  }
  const lists = listsOf(board);
  const index = lists[drop.from.list]?.indexOf(drop.orderId) ?? -1;
  const next = movedOrder(lists, { list: drop.from.list, index }, drop.to);
  if (next === null) {
    return null;
  }
  const reference = referenceOf(board, drop.orderId);
  if (target === undefined) {
    return { kind: 'relayout', lists: next, text: `${reference} retirée · à répartir` };
  }
  const position = (next[target.key]?.indexOf(drop.orderId) ?? 0) + 1;
  return {
    kind: 'relayout',
    lists: next,
    text: `${reference} → ${roundLabel(target)} · arrêt ${String(position)}`,
  };
}

/** ↑ ↓ : la permutation entière, l'arrêt monté ou descendu d'un rang. */
export function shiftOutcome(board: Board, key: string, shift: StopShift): GestureOutcome | null {
  const round = board.rounds.find((candidate) => candidate.key === key);
  if (round === undefined || round.frozen) {
    return null;
  }
  const ids = round.stops.map((stop) => stop.orderId);
  const next = shiftedOrder(ids, shift.index, shift.delta);
  const moving = ids[shift.index];
  if (next === null || moving === undefined) {
    return null;
  }
  const position = shift.index + shift.delta + 1;
  return {
    kind: 'relayout',
    lists: { [round.key]: next },
    text: `${referenceOf(board, moving)} → ${roundLabel(round)} · arrêt ${String(position)}`,
  };
}

/** « Retirer de la tournée » (Q11 : à la main) — la commande revient à répartir. */
export function removeOutcome(board: Board, key: string, orderId: string): GestureOutcome | null {
  const round = board.rounds.find((candidate) => candidate.key === key);
  if (round === undefined || round.frozen) {
    return null;
  }
  const lists = listsOf(board);
  return {
    kind: 'relayout',
    lists: {
      [round.key]: round.stops.map((stop) => stop.orderId).filter((id) => id !== orderId),
      [POOL_KEY]: [...(lists[POOL_KEY] ?? []), orderId],
    },
    text: `${referenceOf(board, orderId)} retirée · à répartir`,
  };
}

/** « Ranger par créneau » : par début de fenêtre, puis la permutation entière (I2, C8). */
export function sortOutcome(board: Board | null, key: string): GestureOutcome | null {
  const round = board?.rounds.find((candidate) => candidate.key === key);
  if (round === undefined || round.frozen) {
    return null;
  }
  const sorted = sortedByWindow(round.stops).map((stop) => stop.orderId);
  if (sorted.every((id, index) => id === round.stops[index]?.orderId)) {
    return null;
  }
  return {
    kind: 'relayout',
    lists: { [key]: sorted },
    text: `${roundLabel(round)} · rangée par créneau`,
  };
}

function referenceOf(board: Board, orderId: string): string {
  return (
    board.pool.find((order) => order.orderId === orderId)?.reference ??
    board.rounds.flatMap((round) => round.stops).find((stop) => stop.orderId === orderId)
      ?.reference ??
    orderId
  );
}
