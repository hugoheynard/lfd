import type { Recurrence } from '@lfd/contracts';

/** Libellés FR des rythmes, pour les sélecteurs et l'affichage. */
export const RECURRENCE_LABELS: Readonly<Record<Recurrence, string>> = {
  weekly: 'Chaque semaine',
  biweekly: 'Toutes les 2 semaines',
  monthly: 'Chaque mois',
};

/** Options ordonnées (sélecteur de rythme). */
export const RECURRENCE_OPTIONS: readonly { readonly value: Recurrence; readonly label: string }[] =
  [
    { value: 'weekly', label: RECURRENCE_LABELS.weekly },
    { value: 'biweekly', label: RECURRENCE_LABELS.biweekly },
    { value: 'monthly', label: RECURRENCE_LABELS.monthly },
  ];

/** `Date` → `AAAA-MM-JJ` (jour local). */
function toIso(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** La date du jour en `AAAA-MM-JJ` (jour local). */
export function todayIso(): string {
  return toIso(new Date());
}

/** Le lendemain d'une date `AAAA-MM-JJ` — retrait/livraison = commande + 1 jour. */
export function nextDayIso(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return toIso(date);
}

/** Formate `AAAA-MM-JJ` en date courte fr (« 8 août 2026 »). */
export function formatDayFr(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Avance une date d'un pas de récurrence (immuablement). */
function advance(date: Date, recurrence: Recurrence): Date {
  const next = new Date(date);
  if (recurrence === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  } else {
    next.setDate(next.getDate() + (recurrence === 'biweekly' ? 14 : 7));
  }
  return next;
}

/**
 * Les **prochaines échéances** (`AAAA-MM-JJ`) d'un abonnement à partir
 * d'aujourd'hui : on déroule depuis `start` au pas du rythme, on saute celles
 * déjà passées, on s'arrête à `count`, à `end` (inclus) ou à un garde-fou.
 */
export function nextOccurrences(
  startIso: string,
  recurrence: Recurrence,
  endIso: string | null,
  count: number,
  todayIso: string,
): readonly string[] {
  const out: string[] = [];
  const today = new Date(`${todayIso}T00:00:00`);
  const end = endIso === null ? null : new Date(`${endIso}T00:00:00`);
  let cursor = new Date(`${startIso}T00:00:00`);

  for (let guard = 0; out.length < count && guard < 1000; guard += 1) {
    if (end !== null && cursor > end) {
      break;
    }
    if (cursor >= today) {
      out.push(toIso(cursor));
    }
    cursor = advance(cursor, recurrence);
  }
  return out;
}
