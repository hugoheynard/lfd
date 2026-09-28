import { type DaySupervisionView, instantToLocal } from '@lfd/contracts';

import { dayLabelOf } from '../production/worksheet-day';

import { clockLabel } from './supervision-labels';

/**
 * **Le jour de service d'à côté** — `AAAA-MM-JJ` décalé de `days` jours.
 *
 * Calculé en UTC sur la date seule, jamais sur un instant local : un jour de
 * service n'a pas d'heure, et un décalage d'heure d'été ferait sauter ou
 * répéter un jour si l'on passait par minuit local. Le serveur reste celui qui
 * dit quel jour est « aujourd'hui » ; cette fonction ne fait que compter.
 */
export function shiftServiceDay(isoDay: string, days: number): string {
  const [year, month, day] = isoDay.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return shifted.toISOString().slice(0, 10);
}

/** Une date de requête plausible — `AAAA-MM-JJ` — ou `null` : l'adresse se tape à la main. */
export function serviceDayParam(raw: string | null): string | null {
  return raw !== null && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

/** Combien de jours séparent deux jours de service — en UTC, pour la même raison. */
export function dayDiff(isoDay: string, from: string): number {
  const utc = (value: string): number => {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1);
  };
  return Math.round((utc(isoDay) - utc(from)) / DAY_MS);
}

/**
 * **Le jour du serveur.** Sans date choisie, c'est celui qu'il a rendu. Avec
 * une date choisie, le serveur rend CELLE-LÀ : on lit alors le jour de Paris
 * de son horloge (`asOf`), jamais celle du poste.
 */
export function serverDayOf(view: DaySupervisionView, chosen: string | null): string {
  return chosen === null ? view.date : instantToLocal(new Date(view.asOf)).day;
}

/** Le bandeau « autre jour » (Supervision v2, A2), ou `null` le jour même. */
export interface DayStrip {
  readonly past: boolean;
  readonly chip: string;
  readonly text: string;
}

export function dayStripOf(date: string, relative: number): DayStrip | null {
  if (relative === 0) {
    return null;
  }
  const label = dayLabelOf(date);
  return relative < 0
    ? {
        past: true,
        chip: relative === -1 ? 'Hier · relecture' : 'Relecture',
        text: `Vous relisez ${label}. La journée est close, les colonnes ne bougent plus.`,
      }
    : {
        past: false,
        chip: relative === 1 ? 'Demain · à venir' : 'À venir',
        text: `Vous regardez ${label}. Plan pas encore arrêté : la journée se lit sans se préparer.`,
      };
}

const SHORT_DAY = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const STAMP_DAY = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'short',
});

/** La fraîcheur du masthead : son texte au bureau, au téléphone, et sa pastille. */
export interface SupervisionStamp {
  readonly wide: string;
  readonly narrow: string;
  readonly tone: 'fresh' | 'late' | 'other';
}

/**
 * « jeudi 25 sept. · à jour à 7 h 55 » ; en retard — la dernière relecture a
 * échoué, ou elle date de plus d'un cycle —, « à jour à 7 h 51 · relecture en
 * retard de 4 min » ; un autre jour, « 24 sept. · close » ou « · plan ouvert ».
 */
export function stampOf(
  view: DaySupervisionView | null,
  relative: number,
  stale: boolean,
  now: number,
  cycleMs: number,
): SupervisionStamp | null {
  if (view === null) {
    return null;
  }
  const at = (iso: string): Date => new Date(`${iso}T00:00:00`);
  if (relative !== 0) {
    const short = SHORT_DAY.format(at(view.date));
    return {
      wide: `${short} · ${relative < 0 ? 'close' : 'plan ouvert'}`,
      narrow: short,
      tone: 'other',
    };
  }
  const clock = clockLabel(view.asOf) ?? '';
  const age = now - new Date(view.asOf).getTime();
  if (stale || age > cycleMs) {
    return {
      wide: `à jour à ${clock} · relecture en retard de ${String(Math.max(1, Math.round(age / MINUTE_MS)))} min`,
      narrow: `${clock} · en retard`,
      tone: 'late',
    };
  }
  return {
    wide: `${STAMP_DAY.format(at(view.date))} · à jour à ${clock}`,
    narrow: `à jour ${clock}`,
    tone: 'fresh',
  };
}
