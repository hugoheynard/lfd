import { instantToLocal } from "@lfd/contracts";

/**
 * **Ce qu'une impression provisoire porte en tête de chaque page** (décision
 * de Hugo du 2026-11-24) : « Provisoire 26/11 #4 11:15 » — le jour du lot,
 * le numéro d'impression de la journée, et l'heure du tirage, **à l'heure de
 * Paris**. Une fiche qui traîne dit d'elle-même qu'elle n'est pas le papier
 * arrêté, et laquelle elle est.
 */
export interface ProvisionalStamp {
  readonly run: number;
  readonly printedAt: Date;
}

/** Le pied d'une impression provisoire, à la place de « Arrêté par … ». */
export const PROVISIONAL_FOOTER = "Provisoire — plan non arrêté";

/** L'en-tête d'une page provisoire. */
export function provisionalHeader(serviceDay: string, stamp: ProvisionalStamp): string {
  const dayMonth = `${serviceDay.slice(8, 10)}/${serviceDay.slice(5, 7)}`;
  const { time } = instantToLocal(stamp.printedAt);
  return `Provisoire ${dayMonth} #${String(stamp.run)} ${time}`;
}
