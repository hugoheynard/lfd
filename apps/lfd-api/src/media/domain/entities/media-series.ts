import {
  InvalidMediaSeriesShotOnError,
  InvalidMediaSeriesTitleError,
  MEDIA_SERIES_NOTE_MAX,
  MEDIA_SERIES_TITLE_MAX,
  MediaSeriesNoteTooLongError,
} from "../errors/media-series-errors.js";

/** Ce qu'on décide d'une série — tout ce qui se corrige. */
export interface MediaSeriesDescription {
  readonly title: string;
  /** `AAAA-MM-JJ`, ou `null` : on ne sait pas quel jour. */
  readonly shotOn: string | null;
  readonly note: string | null;
}

/** Une série telle que la persistance la range et la rend. */
export interface MediaSeriesSnapshot extends MediaSeriesDescription {
  readonly id: string;
}

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
const FEBRUARY = 2;
const LEAP_FEBRUARY_DAYS = 29;

/**
 * **Une série** — des images prises ensemble, sous un titre (plan L3,
 * 2026-10-10).
 *
 * Elle regroupe, elle ne possède pas : c'est l'image qui porte sa série, et
 * rien ne la supprime.
 *
 * 🔴 **La prise de vue ne peut pas être après aujourd'hui** (jour civil de
 * Paris, que l'appelant fournit — le domaine ne lit pas l'horloge). C'est un
 * fait passé : une date future ne peut être qu'une faute de frappe, et elle
 * ne serait pas anodine — le tri « prise de vue » range le plus récent
 * d'abord, donc une série datée de 2062 ouvrirait le fil pour toujours. La
 * contrepartie est assumée : préparer la veille une série pour le lendemain
 * se fait sans date, et on la date après coup.
 */
export class MediaSeries {
  private constructor(
    readonly id: string,
    private description: MediaSeriesDescription,
  ) {}

  /**
   * Ouvre une série.
   *
   * @param today le jour civil de Paris, `AAAA-MM-JJ` — la borne de `shotOn`.
   * @throws {InvalidMediaSeriesTitleError} titre vide (rogné) ou trop long.
   * @throws {MediaSeriesNoteTooLongError} note trop longue.
   * @throws {InvalidMediaSeriesShotOnError} jour illisible, inexistant, ou à venir.
   */
  static declare(id: string, input: MediaSeriesDescription, today: string): MediaSeries {
    return new MediaSeries(id, validated(input, today));
  }

  /**
   * Relit une série rangée. Le titre et la note se revalident ; la date non,
   * contre aujourd'hui : ce qui était passé hier l'est encore.
   */
  static rehydrate(snapshot: MediaSeriesSnapshot): MediaSeries {
    return new MediaSeries(snapshot.id, {
      title: titleOf(snapshot.title),
      shotOn: snapshot.shotOn,
      note: noteOf(snapshot.note),
    });
  }

  /**
   * Corrige le titre, le jour et la note — les trois ensemble, comme l'écran
   * les envoie. Mêmes règles qu'à l'ouverture.
   */
  describe(input: MediaSeriesDescription, today: string): void {
    this.description = validated(input, today);
  }

  snapshot(): MediaSeriesSnapshot {
    return { id: this.id, ...this.description };
  }
}

function validated(input: MediaSeriesDescription, today: string): MediaSeriesDescription {
  return {
    title: titleOf(input.title),
    shotOn: shotOnOf(input.shotOn, today),
    note: noteOf(input.note),
  };
}

function titleOf(raw: string): string {
  const title = raw.trim();
  if (title === "" || title.length > MEDIA_SERIES_TITLE_MAX) {
    throw new InvalidMediaSeriesTitleError(title.length);
  }
  return title;
}

/** Une note vide n'est pas une note : elle devient `null`. */
function noteOf(raw: string | null): string | null {
  const note = raw?.trim() ?? "";
  if (note.length > MEDIA_SERIES_NOTE_MAX) {
    throw new MediaSeriesNoteTooLongError(note.length);
  }
  return note === "" ? null : note;
}

function shotOnOf(raw: string | null, today: string): string | null {
  if (raw === null) {
    return null;
  }
  if (!isCalendarDay(raw)) {
    throw new InvalidMediaSeriesShotOnError(raw, "unreadable");
  }
  // Deux jours `AAAA-MM-JJ` se comparent comme du texte.
  if (raw > today) {
    throw new InvalidMediaSeriesShotOnError(raw, "future");
  }
  return raw;
}

/** `AAAA-MM-JJ` ET un jour qui existe — le 31 avril n'en est pas un. */
export function isCalendarDay(raw: string): boolean {
  const match = DAY_PATTERN.exec(raw);
  if (match === null) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > MONTH_DAYS.length || day < 1) {
    return false;
  }
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const last = month === FEBRUARY && leap ? LEAP_FEBRUARY_DAYS : (MONTH_DAYS[month - 1] ?? 0);
  return day <= last;
}
