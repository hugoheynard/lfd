import type { ProductionForecastDay } from '@lfd/contracts';

/**
 * La **plage** du prévisionnel et ses en-têtes de colonne — de l'arithmétique
 * pure, séparée de la grille parce qu'elle change pour d'autres raisons.
 *
 * 🔴 **Tout se calcule en UTC, à minuit.** Un `setDate()` en heure locale
 * redouble un jour au passage à l'heure d'hiver — un dimanche fantôme dans la
 * plage, une colonne de trop, et personne ne chercherait là. Le serveur applique
 * la même règle sur `ServiceRange` ; les deux doivent tomber d'accord, sans quoi
 * l'écran demanderait sept jours et en recevrait huit.
 */

/** La fenêtre par défaut : aujourd'hui plus six jours. */
export const FORECAST_DAYS = 7;

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', timeZone: 'UTC' });
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** Une colonne, prête à afficher. */
export interface ForecastHeader {
  readonly date: string;
  /** `lun.` — le jour de la semaine, abrégé. */
  readonly weekday: string;
  /** `1 sept.` — la date, abrégée. */
  readonly dayMonth: string;
  /** `aujourd'hui`, `J+1`, … — la distance, qui est la vraie question. */
  readonly offset: string;
  readonly totalUnits: number;
  /** La journée est arrêtée : son chiffre est un fait, pas une prévision. */
  readonly closed: boolean;
  readonly today: boolean;
  /** Le jour le plus chargé de la plage — la seule colonne teintée. */
  readonly peak: boolean;
}

/** `AAAA-MM-JJ` d'un instant, en heure LOCALE — le jour tel que l'équipe le dit. */
export function isoDay(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Le jour `AAAA-MM-JJ` décalé de `days` — en UTC, donc sans jour fantôme. */
export function shiftDay(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00.000Z`) + days * ONE_DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * La borne haute d'une fenêtre qui commence à `from`.
 *
 * `FORECAST_DAYS - 1` parce que les deux bornes sont **comprises** : sept jours
 * à couvrir vont de J à J+6, et se tromper d'un cran ici afficherait huit
 * colonnes dont la dernière serait toujours vide.
 */
export function windowEnd(from: string, days = FORECAST_DAYS): string {
  return shiftDay(from, days - 1);
}

/**
 * Les en-têtes des colonnes.
 *
 * `today` est comparé au jour LOCAL : c'est le jour tel que l'équipe le dit, et
 * le marquer d'après l'UTC ferait basculer le repère à une heure du matin.
 *
 * Le **pic** vient du serveur et n'est pas recalculé ici : le déduire de ce qui
 * est affiché donnerait un pic différent selon la plage ouverte, donc un pic qui
 * bouge quand on navigue — alors que c'est précisément l'information qu'on vient
 * chercher.
 */
export function forecastHeaders(
  days: readonly ProductionForecastDay[],
  peakDate: string | null,
  today: string,
): readonly ForecastHeader[] {
  return days.map((day) => {
    const date = new Date(`${day.date}T00:00:00.000Z`);
    return {
      date: day.date,
      weekday: WEEKDAY.format(date),
      dayMonth: DAY_MONTH.format(date),
      offset: offsetLabel(today, day.date),
      totalUnits: day.totalUnits,
      closed: day.closed,
      today: day.date === today,
      peak: day.date === peakDate,
    };
  });
}

/**
 * « aujourd'hui », « J+2 », « J−1 ». La distance plutôt que la date : celui qui
 * ouvre cet écran cherche **quand** ça lui tombe dessus, pas quel jour on est.
 */
function offsetLabel(today: string, date: string): string {
  const days = Math.round(
    (Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${today}T00:00:00.000Z`)) / ONE_DAY_MS,
  );
  if (days === 0) {
    return 'aujourd’hui';
  }
  return days > 0 ? `J+${String(days)}` : `J−${String(-days)}`;
}
