import type {
  PromotionConditionView,
  PromotionHoursMomentValue,
  PromotionTermsPayload,
  Weekday,
} from '@lfd/contracts';

/**
 * **Les jours et heures d'une promotion, côté écran**
 * (`documentation/promotions/plan-jours-et-heures.md`, § 8 et § 11) — pur :
 * le brouillon de la condition `weekly_hours`, son contrat, ses refus et sa
 * phrase.
 *
 * Les refus recopient ceux du domaine (`promotion-weekly-hours.ts`, lu le
 * 2026-10-31) pour être dits AVANT l'envoi ; le serveur reste juge, et son
 * refus nommé revient tel quel à l'écran.
 */

/** Une plage telle qu'on la saisit ; `end` vaut `24:00` pour « jusqu'à minuit ». */
export interface DraftHoursWindow {
  readonly weekdays: readonly Weekday[];
  readonly start: string;
  readonly end: string;
}

/**
 * La condition saisie. `on` est la case « Seulement certains jours et
 * heures » : décochée, les plages restent dans le brouillon (un aller-retour
 * ne perd rien) mais ne partent pas.
 */
export interface DraftHours {
  readonly on: boolean;
  readonly moment: PromotionHoursMomentValue;
  readonly announceOutside: boolean;
  readonly windows: readonly DraftHoursWindow[];
}

/** « Jusqu'à minuit » : la seule fin qui n'est pas une heure de la journée. */
export const MIDNIGHT_END = '24:00';

export const WEEK: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
export const WORKWEEK: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri'];

const DAY_NAMES: Readonly<Record<Weekday, string>> = {
  mon: 'lundi',
  tue: 'mardi',
  wed: 'mercredi',
  thu: 'jeudi',
  fri: 'vendredi',
  sat: 'samedi',
  sun: 'dimanche',
};

/** « Lun », « Mar »… — les cases des jours. */
export const WEEKDAY_SHORT: Readonly<Record<Weekday, string>> = {
  mon: 'Lun',
  tue: 'Mar',
  wed: 'Mer',
  thu: 'Jeu',
  fri: 'Ven',
  sat: 'Sam',
  sun: 'Dim',
};

/** Une plage neuve : la semaine ouvrée, sans heures — la forme les réclame. */
export const NEW_WINDOW: DraftHoursWindow = { weekdays: WORKWEEK, start: '', end: '' };

export const NO_HOURS: DraftHours = {
  on: false,
  moment: 'ordered_at',
  announceOutside: true,
  windows: [NEW_WINDOW],
};

/** La condition relue de la promotion, entière ; sans elle, la case décochée. */
export function draftHoursOf(conditions: readonly PromotionConditionView[]): DraftHours {
  const hours = conditions.find((condition) => condition.kind === 'weekly_hours');
  if (hours === undefined) {
    return NO_HOURS;
  }
  return {
    on: true,
    moment: hours.moment,
    announceOutside: hours.announceOutside,
    windows: hours.windows.map(({ weekdays, start, end }) => ({
      weekdays: [...weekdays],
      start,
      end,
    })),
  };
}

/** La condition à envoyer ; les jours dans l'ordre de la semaine. */
export function hoursConditionOf(hours: DraftHours): PromotionTermsPayload['conditions'][number] {
  return {
    kind: 'weekly_hours',
    moment: hours.moment,
    announceOutside: hours.announceOutside,
    windows: hours.windows.map((window) => ({
      weekdays: WEEK.filter((day) => window.weekdays.includes(day)),
      start: window.start,
      end: window.end,
    })),
  };
}

const HOUR_SHAPE = /^([01]\d|2[0-3]):[0-5]\d$/u;
const MINUTES_PER_HOUR = 60;

function minutesOf(time: string): number {
  const [hours = '0', minutes = '0'] = time.split(':');
  return Number(hours) * MINUTES_PER_HOUR + Number(minutes);
}

/** `07:30` → « 7 h 30 », `17:00` → « 17 h », `24:00` → « minuit ». */
export function hourText(time: string): string {
  if (time === MIDNIGHT_END) {
    return 'minuit';
  }
  const [hours = '0', minutes = '00'] = time.split(':');
  return minutes === '00' ? `${Number(hours)} h` : `${Number(hours)} h ${minutes}`;
}

function rangeText(window: DraftHoursWindow): string {
  return `de ${hourText(window.start)} à ${hourText(window.end)}`;
}

/** Ce qui empêche d'envoyer les heures, dans les mots du serveur ; `null` sinon. */
export function hoursProblem(hours: DraftHours): string | null {
  if (!hours.on) {
    return null;
  }
  if (hours.windows.length === 0) {
    return "La condition « jours et heures » n'a aucune plage : ajoutez-en une, ou retirez la condition.";
  }
  for (const window of hours.windows) {
    const problem = windowProblem(window);
    if (problem !== null) {
      return problem;
    }
  }
  return overlapProblem(hours.windows);
}

function windowProblem(window: DraftHoursWindow): string | null {
  const endReadable = HOUR_SHAPE.test(window.end) || window.end === MIDNIGHT_END;
  if (!HOUR_SHAPE.test(window.start) || !endReadable) {
    return "Donnez l'heure de début et l'heure de fin de chaque plage.";
  }
  if (minutesOf(window.end) <= minutesOf(window.start)) {
    return (
      `La plage ${rangeText(window)} finit avant de commencer ou en même temps : une plage ne passe pas minuit, ` +
      "faites deux plages (jusqu'à minuit, puis dès 0 h le lendemain)."
    );
  }
  if (window.weekdays.length === 0) {
    return `La plage ${rangeText(window)} n'a aucun jour : cochez au moins un jour, ou retirez la plage.`;
  }
  return null;
}

function overlapProblem(windows: readonly DraftHoursWindow[]): string | null {
  for (const day of WEEK) {
    const sorted = windows
      .filter((window) => window.weekdays.includes(day))
      .sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
    for (let index = 1; index < sorted.length; index += 1) {
      const previous = sorted[index - 1];
      const current = sorted[index];
      if (
        previous !== undefined &&
        current !== undefined &&
        minutesOf(current.start) < minutesOf(previous.end)
      ) {
        return (
          `Le ${DAY_NAMES[day]}, les plages ${rangeText(previous)} et ${rangeText(current)} se chevauchent : ` +
          'un même jour, deux plages ne se recouvrent pas — fusionnez-les.'
        );
      }
    }
  }
  return null;
}

/** « tous les jours », « du lundi au vendredi », « le mardi et le jeudi ». */
export function weekdaysPhrase(weekdays: readonly Weekday[]): string {
  const days = WEEK.filter((day) => weekdays.includes(day));
  if (days.length === WEEK.length) {
    return 'tous les jours';
  }
  const names = days.map((day) => DAY_NAMES[day]);
  const first = WEEK.indexOf(days[0] ?? 'mon');
  const last = WEEK.indexOf(days.at(-1) ?? 'mon');
  if (names.length >= 3 && last - first === names.length - 1) {
    return `du ${names[0] ?? ''} au ${names.at(-1) ?? ''}`;
  }
  if (names.length <= 1) {
    return names.length === 0 ? 'un jour à choisir' : `le ${names[0] ?? ''}`;
  }
  return `le ${names.slice(0, -1).join(', le ')} et le ${names.at(-1) ?? ''}`;
}

const MOMENT_PHRASE: Readonly<Record<PromotionHoursMomentValue, string>> = {
  ordered_at: 'à la commande',
  handover_at: 'au créneau de retrait ou de livraison',
};

/**
 * « le mardi et le jeudi de 17 h à 19 h, à la commande » ; `null` sans
 * condition. Une heure pas encore saisie se dit « à préciser ».
 */
export function hoursPhrase(hours: DraftHours): string | null {
  if (!hours.on) {
    return null;
  }
  if (hours.windows.length === 0) {
    return 'à des heures à préciser';
  }
  const ranges = hours.windows.map((window) =>
    window.start === '' || window.end === ''
      ? `${weekdaysPhrase(window.weekdays)} à des heures à préciser`
      : `${weekdaysPhrase(window.weekdays)} ${rangeText(window)}`,
  );
  const listed =
    ranges.length === 1
      ? (ranges[0] ?? '')
      : `${ranges.slice(0, -1).join(', ')} et ${ranges.at(-1) ?? ''}`;
  return `${listed}, ${MOMENT_PHRASE[hours.moment]}`;
}
