import type { AppError } from "../../../../platform/shared/errors/app-error.js";
import {
  CardPhoto,
  type CardPhotoRefusals,
  cardPhotoContentType,
} from "../../../shared/photo-cards/domain/value-objects/card-photo.js";
import {
  ClientNotePhotoPairError,
  InvalidClientNotePhotoError,
  InvalidClientNoteThumbnailError,
} from "../errors/client-notebook-errors.js";

/**
 * **600 Ko** par photo lisible. L'écran la réduit à 2400 px de grand côté
 * avant l'envoi : ce qui arrive au-delà n'a pas été réduit.
 *
 * ⚠️ Estimée, pas encore mesurée sur de vraies photos de notes (plan
 * `documentation/b2b/plan-notes-photo-du-commercial.md`, D7 bis). `@lfd/contracts`
 * en garde une copie (`CLIENT_NOTE_PHOTO_MAX_BYTES`) ; le test tient la parité.
 */
export const CLIENT_NOTE_PHOTO_MAX_BYTES = 600 * 1024;

/** **60 Ko** par vignette : la liste ne charge qu'elles. Copie au contrat. */
export const CLIENT_NOTE_THUMBNAIL_MAX_BYTES = 60 * 1024;

const BYTES_PER_KILOBYTE = 1024;

/**
 * Une taille en Ko, arrondie au-dessus. Pas les Mo du socle : à une décimale,
 * une photo de 610 Ko et la borne de 600 s'écriraient toutes deux « 0.6 Mo », et
 * le refus se contredirait.
 */
function kilobytes(bytes: number): number {
  return Math.ceil(bytes / BYTES_PER_KILOBYTE);
}

/** Les refus d'une image de note, dans les mots de ce qu'elle est. */
function refusalsOf(fail: (reason: string) => AppError): CardPhotoRefusals {
  return {
    empty: () => fail("le fichier est vide. Reprenez la photo."),
    tooHeavy: (size, max) =>
      fail(
        `elle pèse ${kilobytes(size)} Ko, la limite est de ${kilobytes(max)} Ko. ` +
          "Déposez-la depuis l'écran des notes, qui la réduit avant l'envoi.",
      ),
    unsupportedFormat: () =>
      fail(
        "un JPEG ou un PNG est attendu (ni HEIC, ni PDF). Enregistrez la photo dans l'un " +
          "de ces deux formats, puis déposez-la à nouveau.",
      ),
    truncated: () =>
      fail("l'image est tronquée : ses dimensions ne se lisent pas. Reprenez la photo."),
  };
}

const PHOTO_RULES = {
  maxBytes: CLIENT_NOTE_PHOTO_MAX_BYTES,
  refusals: refusalsOf((reason) => new InvalidClientNotePhotoError(reason)),
};

const THUMBNAIL_RULES = {
  maxBytes: CLIENT_NOTE_THUMBNAIL_MAX_BYTES,
  refusals: refusalsOf((reason) => new InvalidClientNoteThumbnailError(reason)),
};

/**
 * **La photo d'une note et sa vignette**, validées ensemble.
 *
 * Une paire et non deux photos facultatives côte à côte : la liste n'affiche que
 * les vignettes, l'ouverture en grand que la photo lisible. « Une photo sans
 * vignette » n'a donc pas de représentation ici — elle est refusée à la
 * construction. La vignette est propre aux notes : les étapes de livraison n'en
 * ont pas, et le socle ne la connaît pas.
 *
 * `create()` est le seul constructeur : une paire non conforme n'existe pas en
 * mémoire, donc ne part jamais au stockage.
 */
export class ClientNotePhoto {
  private constructor(
    readonly photo: CardPhoto,
    readonly thumbnail: CardPhoto,
  ) {}

  /**
   * Valide la photo, puis la vignette — la photo d'abord : c'est elle que la
   * commerciale a choisie, et son refus est celui qui l'aide.
   *
   * @throws {ClientNotePhotoPairError} l'une est jointe sans l'autre.
   * @throws {InvalidClientNotePhotoError} la photo est vide, trop lourde, d'un
   *   format refusé ou tronquée.
   * @throws {InvalidClientNoteThumbnailError} même chose pour la vignette.
   */
  static create(photo: Buffer | null, thumbnail: Buffer | null): ClientNotePhoto {
    if (photo === null || thumbnail === null) {
      throw new ClientNotePhotoPairError();
    }
    return new ClientNotePhoto(
      CardPhoto.create(photo, PHOTO_RULES),
      CardPhoto.create(thumbnail, THUMBNAIL_RULES),
    );
  }

  /**
   * La paire jointe à un ajout, ou `null` quand la note arrive sans photo.
   *
   * @throws ce que lève {@link ClientNotePhoto.create} dès qu'un fichier est joint.
   */
  static optional(photo: Buffer | null, thumbnail: Buffer | null): ClientNotePhoto | null {
    return photo === null && thumbnail === null ? null : ClientNotePhoto.create(photo, thumbnail);
  }
}

/**
 * Le type d'une image **déjà rangée**, relu dans ses octets. `null` quand ce
 * n'est ni un JPEG ni un PNG : pour un objet que seul {@link ClientNotePhoto}
 * a pu écrire, c'est une incohérence entre le bucket et la base.
 */
export function clientNoteImageContentType(bytes: Buffer): string | null {
  return cardPhotoContentType(bytes);
}
