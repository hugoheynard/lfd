import { DomainError, ResourceNotFoundError } from "../../../platform/shared/errors/app-error.js";

/** Plafonds d'une série — les mêmes que les colonnes (`media.media_series`). */
export const MEDIA_SERIES_TITLE_MAX = 120;
export const MEDIA_SERIES_NOTE_MAX = 2000;

/** Un titre vide ou trop long (→ 400). */
export class InvalidMediaSeriesTitleError extends DomainError {
  constructor(length: number) {
    super(
      "media.series.invalid_title",
      length === 0
        ? "Une série porte un titre : donnez-lui un nom qui dise ce qu'on y a photographié."
        : `Titre de série trop long : ${String(length)} caractères pour ${String(MEDIA_SERIES_TITLE_MAX)} au plus. Raccourcissez-le, et mettez le reste dans la note.`,
    );
  }
}

/** Une note au-delà du plafond (→ 400). */
export class MediaSeriesNoteTooLongError extends DomainError {
  constructor(length: number) {
    super(
      "media.series.note_too_long",
      `Note de série trop longue : ${String(length)} caractères pour ${String(MEDIA_SERIES_NOTE_MAX)} au plus.`,
    );
  }
}

/** Un jour de prise de vue illisible, inexistant ou à venir (→ 400). */
export class InvalidMediaSeriesShotOnError extends DomainError {
  constructor(day: string, reason: "unreadable" | "future") {
    super(
      "media.series.invalid_shot_on",
      reason === "future"
        ? `La prise de vue du ${day} n'a pas encore eu lieu : indiquez le jour où les photos ont été prises, ou laissez la date vide.`
        : `Jour de prise de vue illisible (« ${day} ») : il s'écrit AAAA-MM-JJ et doit exister au calendrier.`,
    );
  }
}

/** La série visée n'existe pas (→ 404). */
export class MediaSeriesNotFoundError extends ResourceNotFoundError {
  constructor(id: string) {
    super(
      "media.series.not_found",
      `Série introuvable (${id}) : rechargez la liste des séries et choisissez-en une qui existe, ou déposez sans série.`,
    );
  }
}
