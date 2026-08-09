/**
 * Algèbre d'intervalles en **minutes depuis minuit** — la brique de calcul des
 * disponibilités d'une journée. Fonctions pures, sans notion de date ni de
 * fuseau : c'est volontaire, la journée est déjà choisie par l'appelant.
 */

/** Un intervalle **demi-ouvert** `[start, end)`, en minutes depuis minuit. */
export interface MinuteInterval {
  readonly start: number;
  readonly end: number;
}

/**
 * Fusionne les intervalles qui se chevauchent ou se touchent, et trie le tout.
 * « 09:00–12:00 » + « 11:00–14:00 » = « 09:00–14:00 » : deux règles qui se
 * recouvrent ne doivent pas produire deux fois le même créneau.
 */
export function mergeIntervals(intervals: readonly MinuteInterval[]): MinuteInterval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  const merged: MinuteInterval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && current.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, current.end) };
      continue;
    }
    merged.push(current);
  }
  return merged;
}

/**
 * Retire `holes` de `base` (les deux étant quelconques) et rend le reste, trié.
 * Une fermeture qui coupe une plage en deux rend bien **deux** plages.
 */
export function subtractIntervals(
  base: readonly MinuteInterval[],
  holes: readonly MinuteInterval[],
): MinuteInterval[] {
  const cuts = mergeIntervals(holes);
  let remaining = mergeIntervals(base);
  for (const hole of cuts) {
    remaining = remaining.flatMap((interval) => punch(interval, hole));
  }
  return remaining;
}

/** Retire un trou d'un seul intervalle : 0, 1 ou 2 morceaux en sortent. */
function punch(interval: MinuteInterval, hole: MinuteInterval): MinuteInterval[] {
  if (hole.end <= interval.start || hole.start >= interval.end) {
    return [interval];
  }
  const pieces: MinuteInterval[] = [];
  if (hole.start > interval.start) {
    pieces.push({ start: interval.start, end: hole.start });
  }
  if (hole.end < interval.end) {
    pieces.push({ start: hole.end, end: interval.end });
  }
  return pieces;
}
