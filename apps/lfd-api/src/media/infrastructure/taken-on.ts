import { addDays, localToInstant } from "@lfd/contracts";

import type { Prisma } from "../../platform/database/client/client.js";
import { dayValue, readDayColumn } from "./series-day.js";

/** Un jour se place à son début, à l'heure de Paris ; minuit existe tous les jours. */
const DAY_START = "00:00";

/**
 * **La date d'une image, telle que la frise la range et que le feed la filtre**
 * : le jour de prise de vue de sa série, à minuit à Paris, sinon son
 * dépôt.
 *
 * 🔴 Ce fichier est le SEUL à définir cette date, pour la lecture
 * ({@link takenAtOf}) comme pour le filtre ({@link takenWhere}) : une colonne
 * de la frise cliquée doit ouvrir exactement les photos qu'elle agrège.
 */
export function takenAtOf(shotOn: Date | null, depositedAt: Date): Date {
  const day = readDayColumn(shotOn);
  return (day === null ? null : localToInstant(day, DAY_START)) ?? depositedAt;
}

/**
 * La même date, en `where` : une série datée se compare par son jour (colonne
 * `date`), une image sans série ou sans date par son dépôt lu à Paris.
 * Jours inclus, déjà validés par l'application. `null` = aucune borne.
 */
export function takenWhere(
  from: string | undefined,
  to: string | undefined,
): Prisma.MediaAssetWhereInput | null {
  if (from === undefined && to === undefined) return null;
  const startOf = (day: string): Date | undefined => localToInstant(day, DAY_START) ?? undefined;
  const depositedFrom = from === undefined ? undefined : startOf(from);
  const depositedBefore = to === undefined ? undefined : startOf(addDays(to, 1));
  return {
    OR: [
      {
        series: {
          is: {
            shotOn: {
              not: null,
              ...(from === undefined ? {} : { gte: dayValue(from) }),
              ...(to === undefined ? {} : { lte: dayValue(to) }),
            },
          },
        },
      },
      {
        OR: [{ seriesId: null }, { series: { is: { shotOn: null } } }],
        createdAt: {
          ...(depositedFrom === undefined ? {} : { gte: depositedFrom }),
          ...(depositedBefore === undefined ? {} : { lt: depositedBefore }),
        },
      },
    ],
  };
}
