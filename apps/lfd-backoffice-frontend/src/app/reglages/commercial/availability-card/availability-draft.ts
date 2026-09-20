import type {
  AvailabilityConfigPayload,
  AvailabilityConfigView,
  AvailabilityExceptionPayload,
  AvailabilityExceptionView,
  AvailabilityRulePayload,
  BookingPolicy,
} from '@lfd/contracts';

/**
 * Le **brouillon** de disponibilité manipulé par l'écran de réglages, et les
 * fonctions pures qui le transforment.
 *
 * Pourquoi un brouillon plutôt que d'éditer la vue serveur : le commercial
 * ajoute une plage, en retire une autre, copie sa journée sur toute la semaine,
 * **puis** enregistre. Tant qu'il n'a pas enregistré, rien ne doit partir.
 *
 * Tout est pur ici — c'est ce qui rend l'écran testable sans rendu.
 */

/** Une plage horaire locale, telle que saisie. */
export interface DraftRange {
  readonly startTime: string;
  readonly endTime: string;
}

/** Le brouillon : les plages par jour de semaine (index 0 = dimanche), + le reste. */
export interface AvailabilityDraft {
  /** 7 entrées, indexées par `Date.getDay()`. */
  readonly week: readonly (readonly DraftRange[])[];
  readonly exceptions: readonly AvailabilityExceptionPayload[];
  readonly policy: BookingPolicy;
}

/** Les jours dans l'ordre où on les LIT (lundi d'abord), avec leur index réel. */
export const WEEK_DAYS: readonly { index: number; label: string }[] = [
  { index: 1, label: 'Lundi' },
  { index: 2, label: 'Mardi' },
  { index: 3, label: 'Mercredi' },
  { index: 4, label: 'Jeudi' },
  { index: 5, label: 'Vendredi' },
  { index: 6, label: 'Samedi' },
  { index: 0, label: 'Dimanche' },
];

/** La plage proposée par défaut quand on en ajoute une — la matinée ouvrée. */
export const DEFAULT_RANGE: DraftRange = { startTime: '09:00', endTime: '12:00' };

/** Un brouillon vide (aucune plage), avec les défauts de politique du serveur. */
export function emptyDraft(policy: BookingPolicy): AvailabilityDraft {
  return { week: WEEK_DAYS.map(() => []), exceptions: [], policy };
}

/** Reconstruit le brouillon depuis ce que le serveur a rendu. */
export function draftFrom(config: AvailabilityConfigView): AvailabilityDraft {
  const week: DraftRange[][] = [[], [], [], [], [], [], []];
  for (const rule of config.rules) {
    week[rule.weekday]?.push({ startTime: rule.startTime, endTime: rule.endTime });
  }
  return {
    week: week.map(sortRanges),
    exceptions: config.exceptions.map((e) => ({
      day: e.day,
      kind: e.kind,
      startTime: e.startTime,
      endTime: e.endTime,
      reason: e.reason,
    })),
    policy: config.policy,
  };
}

/** Ajoute une plage à un jour. */
export function addRange(
  draft: AvailabilityDraft,
  weekday: number,
  range: DraftRange = DEFAULT_RANGE,
): AvailabilityDraft {
  return withWeek(draft, weekday, (ranges) => sortRanges([...ranges, range]));
}

/** Retire la plage `index` d'un jour. */
export function removeRange(
  draft: AvailabilityDraft,
  weekday: number,
  index: number,
): AvailabilityDraft {
  return withWeek(draft, weekday, (ranges) => ranges.filter((_, i) => i !== index));
}

/** Édite une borne d'une plage. Le tri n'est appliqué qu'à l'enregistrement. */
export function editRange(
  draft: AvailabilityDraft,
  weekday: number,
  index: number,
  patch: Partial<DraftRange>,
): AvailabilityDraft {
  return withWeek(draft, weekday, (ranges) =>
    ranges.map((range, i) => (i === index ? { ...range, ...patch } : range)),
  );
}

/**
 * Copie la journée `weekday` sur **les cinq jours ouvrés** — le geste que le
 * commercial fait en premier, et qu'il refait à chaque changement d'horaire.
 */
export function copyToWeekdays(draft: AvailabilityDraft, weekday: number): AvailabilityDraft {
  const source = draft.week[weekday] ?? [];
  return {
    ...draft,
    week: draft.week.map((ranges, index) =>
      index >= 1 && index <= 5 ? source.map((r) => ({ ...r })) : ranges,
    ),
  };
}

/** Vide entièrement une journée. */
export function clearDay(draft: AvailabilityDraft, weekday: number): AvailabilityDraft {
  return withWeek(draft, weekday, () => []);
}

/** Ajoute une exception datée (fermeture ou ouverture ponctuelle). */
export function addException(
  draft: AvailabilityDraft,
  exception: AvailabilityExceptionPayload,
): AvailabilityDraft {
  return {
    ...draft,
    exceptions: [...draft.exceptions, exception].sort((a, b) => a.day.localeCompare(b.day)),
  };
}

/** Retire l'exception `index`. */
export function removeException(draft: AvailabilityDraft, index: number): AvailabilityDraft {
  return { ...draft, exceptions: draft.exceptions.filter((_, i) => i !== index) };
}

/** Remplace la politique de réservation. */
export function withPolicy(
  draft: AvailabilityDraft,
  patch: Partial<BookingPolicy>,
): AvailabilityDraft {
  return { ...draft, policy: { ...draft.policy, ...patch } };
}

/**
 * Le brouillon prêt à envoyer. Les plages **incohérentes** (fin avant début) sont
 * écartées ici : le serveur les refuserait en bloc avec un 400, ce qui ferait
 * perdre au commercial tout le reste de sa saisie.
 */
export function toPayload(draft: AvailabilityDraft): AvailabilityConfigPayload {
  const rules: AvailabilityRulePayload[] = [];
  draft.week.forEach((ranges, weekday) => {
    for (const range of sortRanges(ranges)) {
      if (range.startTime < range.endTime) {
        rules.push({ weekday, startTime: range.startTime, endTime: range.endTime });
      }
    }
  });
  return { rules, exceptions: [...draft.exceptions], policy: draft.policy };
}

/**
 * Le bloc à envoyer pour enregistrer **la seule grille**.
 *
 * Les règles viennent du brouillon ; les exceptions et la politique de ce que le
 * **serveur** détient. Ces deux tranches ont leur propre bouton : les emporter
 * ici écrirait des édits que personne n'a validés, et « Enregistrer la grille »
 * ne dirait plus la vérité.
 */
export function gridPayload(
  draft: AvailabilityDraft,
  persisted: AvailabilityConfigView,
): AvailabilityConfigPayload {
  return {
    ...toPayload(draft),
    exceptions: persisted.exceptions.map(toExceptionPayload),
    policy: persisted.policy,
  };
}

/** Une exception rendue par l'API, réduite à ce que l'API attend en écriture. */
function toExceptionPayload(exception: AvailabilityExceptionView): AvailabilityExceptionPayload {
  return {
    day: exception.day,
    kind: exception.kind,
    startTime: exception.startTime,
    endTime: exception.endTime,
    reason: exception.reason,
  };
}

/**
 * Deux jeux de règles disent-ils la même chose ? Comparé sur les règles
 * **envoyables** (`toPayload` a déjà écarté les plages incohérentes) : si ce
 * qu'on enverrait est ce qui est déjà en base, il n'y a rien à enregistrer.
 */
export function sameRules(
  a: readonly AvailabilityRulePayload[],
  b: readonly AvailabilityRulePayload[],
): boolean {
  return (
    a.length === b.length &&
    a.every((rule, index) => {
      const other = b[index];
      return (
        other !== undefined &&
        rule.weekday === other.weekday &&
        rule.startTime === other.startTime &&
        rule.endTime === other.endTime
      );
    })
  );
}

/** Y a-t-il au moins une plage incohérente ? (pour le dire avant d'enregistrer) */
export function hasInvalidRange(draft: AvailabilityDraft): boolean {
  return draft.week.some((ranges) => ranges.some((r) => r.startTime >= r.endTime));
}

function withWeek(
  draft: AvailabilityDraft,
  weekday: number,
  change: (ranges: readonly DraftRange[]) => readonly DraftRange[],
): AvailabilityDraft {
  return {
    ...draft,
    week: draft.week.map((ranges, index) => (index === weekday ? change(ranges) : ranges)),
  };
}

function sortRanges(ranges: readonly DraftRange[]): DraftRange[] {
  return [...ranges].sort((a, b) => a.startTime.localeCompare(b.startTime));
}
