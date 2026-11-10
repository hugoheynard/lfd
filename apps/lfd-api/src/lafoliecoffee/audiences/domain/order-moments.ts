/**
 * **Le moment de passation** : jour de la semaine × tranche horaire, à
 * l'heure de Paris (`BUSINESS_TIME_ZONE`) — la base stocke `created_at` en UTC.
 *
 * Les bornes des tranches sont lues par la requête (`width_bucket`) : la
 * tranche d'une commande se calcule en base, d'après CETTE table, et le
 * domaine ne fait que la nommer.
 */
export const ORDER_TIME_SLICES = [
  { key: "night", label: "nuit (0 h – 7 h)", startHour: 0 },
  { key: "morning", label: "matin (7 h – 11 h)", startHour: 7 },
  { key: "midday", label: "midi (11 h – 14 h)", startHour: 11 },
  { key: "afternoon", label: "après-midi (14 h – 18 h)", startHour: 14 },
  { key: "evening", label: "soir (18 h – minuit)", startHour: 18 },
] as const;

/** Les jours ISO (1 = lundi … 7 = dimanche), dans cet ordre. */
export const ORDER_WEEKDAYS = [
  { key: "mon", label: "Lundi" },
  { key: "tue", label: "Mardi" },
  { key: "wed", label: "Mercredi" },
  { key: "thu", label: "Jeudi" },
  { key: "fri", label: "Vendredi" },
  { key: "sat", label: "Samedi" },
  { key: "sun", label: "Dimanche" },
] as const;

/**
 * Les bornes passées à `width_bucket(heure, bornes)` : le début de chaque
 * tranche sauf la première. La base rend alors l'INDEX de la tranche (0 à 4).
 */
export function timeSliceBounds(): readonly number[] {
  return ORDER_TIME_SLICES.slice(1).map((slice) => slice.startHour);
}

/** La tranche d'une heure locale (0–23) — la même règle que `width_bucket`. */
export function timeSliceIndexOf(hour: number): number {
  return timeSliceBounds().filter((bound) => hour >= bound).length;
}

/** La case d'un moment, depuis le jour ISO et l'index de tranche que rend la base. */
export function momentCell(
  isoWeekday: number,
  sliceIndex: number,
): { readonly key: string; readonly label: string } | null {
  const day = ORDER_WEEKDAYS[isoWeekday - 1];
  const slice = ORDER_TIME_SLICES[sliceIndex];
  if (day === undefined || slice === undefined) {
    return null;
  }
  return { key: `${day.key}-${slice.key}`, label: `${day.label}, ${slice.label}` };
}

/** Les 35 cases du moment, lundi-nuit d'abord. */
export function allMomentCells(): readonly { readonly key: string; readonly label: string }[] {
  return ORDER_WEEKDAYS.flatMap((_, day) =>
    ORDER_TIME_SLICES.map((__, slice) => momentCell(day + 1, slice)),
  ).filter((cell) => cell !== null);
}
