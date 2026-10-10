import { Injectable, inject, signal } from '@angular/core';
import type { MediaSeriesPayload, MediaSeriesView } from '@lfd/pim-contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { MediaLibraryHttpApi } from './media-library-http-api';

/** Les plafonds d'une série — ceux que le domaine du serveur applique (`MediaSeries`). */
export const SERIES_LIMITS = { title: 120, note: 2000 } as const;

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Un jour nu lu comme un jour, sans fuseau : `2026-03-01` est le 1er mars
 * partout. Le passer à `new Date()` le lirait à minuit UTC, et un poste réglé
 * à l'ouest le dirait le 28 février.
 */
function dayOf(shotOn: string): Date | null {
  const match = DAY.exec(shotOn);
  if (match === null) {
    return null;
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

const MONTH = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const FULL = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const PARIS_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** « mars 2026 » — la date courte d'une pastille. `null` : jour inconnu. */
export function seriesMonth(shotOn: string | null): string | null {
  const day = shotOn === null ? null : dayOf(shotOn);
  return day === null ? null : MONTH.format(day);
}

/** « 12 mars 2026 » — la date d'une ligne de liste. */
export function seriesDay(shotOn: string | null): string | null {
  const day = shotOn === null ? null : dayOf(shotOn);
  return day === null ? null : FULL.format(day);
}

/** « Shooting carte 2026 · mars 2026 », ou le titre seul faute de date. */
export function seriesLabel(series: {
  readonly title: string;
  readonly shotOn: string | null;
}): string {
  const month = seriesMonth(series.shotOn);
  return month === null ? series.title : `${series.title} · ${month}`;
}

/**
 * Aujourd'hui à Paris, `AAAA-MM-JJ` — la borne haute d'une prise de vue.
 *
 * Le serveur reste l'autorité (il refuse un jour à venir) ; l'écran ne fait
 * que griser ce qu'il refuserait.
 */
export function parisToday(at: Date = new Date()): string {
  return PARIS_DAY.format(at);
}

/**
 * **Les séries du fonds** — lues une fois, relues après chaque écriture.
 *
 * Une liste tenue par un store n'a pas d'état « chargement » : elle part vide
 * et se remplit. Son échec se retient, il ne se dit pas en bannière — un
 * choix de série vide ne doit pas faire croire que le fonds n'en a aucune.
 */
@Injectable()
export class MediaSeriesStore {
  private readonly api = inject(MediaLibraryHttpApi);

  private readonly list = signal<readonly MediaSeriesView[]>([]);
  readonly all = this.list.asReadonly();
  /** Le refus du dernier chargement ; `null` quand la liste est juste. */
  readonly failure = signal<string | null>(null);

  async refresh(): Promise<void> {
    try {
      this.list.set(await this.api.series());
      this.failure.set(null);
    } catch (caught) {
      // Rien n'est appliqué : la liste garde ce qu'elle avait.
      this.failure.set(httpErrorMessage(caught, 'Les séries sont illisibles.'));
    }
  }

  find(id: string | null): MediaSeriesView | null {
    return id === null ? null : (this.list().find((series) => series.id === id) ?? null);
  }

  /** Ouvre une série, relit la liste, rend l'identifiant. Le refus est relancé. */
  async open(payload: MediaSeriesPayload): Promise<string> {
    const id = await this.api.openSeries(payload);
    await this.refresh();
    return id;
  }

  /** Corrige une série et relit la liste. Le refus est relancé. */
  async describe(id: string, payload: MediaSeriesPayload): Promise<void> {
    await this.api.describeSeries(id, payload);
    await this.refresh();
  }
}
