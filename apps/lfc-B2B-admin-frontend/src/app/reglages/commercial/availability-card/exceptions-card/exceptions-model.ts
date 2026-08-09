import type { AvailabilityExceptionPayload } from '@lfd/contracts';

/**
 * Les fonctions **pures** de la carte des exceptions : ce qu'une portée ouvre
 * ou ferme, ce que la liste montre, et ce qui compte comme une modification.
 */

/**
 * La **portée** d'une exception dans la journée. Trois choix plutôt que deux
 * champs d'heure : « je ferme le vendredi après-midi » est le geste réel, et
 * saisir `14:00`/`18:00` à la main pour le dire est une corvée qui invite à la
 * faute de frappe. Les bornes restent visibles sur la ligne une fois ajoutée.
 */
export type ExceptionPeriod = 'morning' | 'afternoon' | 'day';

/** Les bornes proposées pour chaque portée — celles d'une journée ouvrée type. */
const MORNING = { startTime: '09:00', endTime: '12:00' };
const AFTERNOON = { startTime: '14:00', endTime: '18:00' };
const FULL_DAY = { startTime: '09:00', endTime: '18:00' };

/**
 * Les bornes d'une exception, selon sa nature et sa portée.
 *
 * Une **fermeture** sur la journée entière n'a pas de bornes (`null`) : c'est ce
 * que le serveur attend pour retirer le jour en entier, exceptions de grille
 * comprises. Une **ouverture** ponctuelle, elle, en exige toujours — sans
 * bornes, elle n'ouvrirait rien de déterminable ; sa « journée » vaut donc les
 * heures ouvrées.
 */
export function boundsFor(
  kind: AvailabilityExceptionPayload['kind'],
  period: ExceptionPeriod,
): { startTime: string | null; endTime: string | null } {
  if (period === 'morning') {
    return MORNING;
  }
  if (period === 'afternoon') {
    return AFTERNOON;
  }
  return kind === 'open' ? FULL_DAY : { startTime: null, endTime: null };
}

/**
 * Le jour **d'aujourd'hui à Paris**, au format `AAAA-MM-JJ`.
 *
 * Passé par `Intl` plutôt que par `toISOString()` : à 23 h en été, l'ISO du
 * navigateur est déjà demain en UTC, et la journée en cours disparaîtrait de la
 * liste une heure avant d'être finie. C'est le fuseau de l'agenda qui fait foi,
 * pas celui de la machine.
 */
export function parisToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(now);
}

/** Une exception et sa position **réelle** dans le brouillon (pas dans la vue). */
export interface IndexedException {
  readonly index: number;
  readonly exception: AvailabilityExceptionPayload;
}

/**
 * Les exceptions **à venir**, aujourd'hui compris, dans l'ordre des jours.
 *
 * Le passé est masqué, pas supprimé : une fermeture d'il y a trois mois ne dit
 * plus rien de l'agenda, mais la retirer d'office serait décider à la place du
 * commercial. Chaque ligne garde donc son index d'origine — c'est lui qui sert à
 * retirer la bonne exception, jamais la position à l'écran.
 */
export function upcomingExceptions(
  exceptions: readonly AvailabilityExceptionPayload[],
  today: string,
): IndexedException[] {
  return exceptions
    .map((exception, index) => ({ index, exception }))
    .filter(({ exception }) => exception.day >= today)
    .sort((a, b) => a.exception.day.localeCompare(b.exception.day));
}

/** Deux listes d'exceptions disent-elles la même chose ? (ordre compris) */
export function sameExceptions(
  a: readonly AvailabilityExceptionPayload[],
  b: readonly AvailabilityExceptionPayload[],
): boolean {
  return (
    a.length === b.length &&
    a.every((exception, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        exception.day === other.day &&
        exception.kind === other.kind &&
        exception.startTime === other.startTime &&
        exception.endTime === other.endTime &&
        exception.reason === other.reason
      );
    })
  );
}
