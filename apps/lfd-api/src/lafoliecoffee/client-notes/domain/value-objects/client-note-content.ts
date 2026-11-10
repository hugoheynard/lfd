import {
  type PhotoCardContentRules,
  readPhotoCardContent,
} from "../../../shared/photo-cards/domain/value-objects/photo-card-content.js";
import { InvalidClientNoteError } from "../errors/client-notebook-errors.js";

/**
 * **80 caractères** : un titre se lit d'un coup d'œil dans la liste.
 * `@lfd/contracts` en garde une copie (`CLIENT_NOTE_TITLE_MAX`) ; l'autorité est
 * ici, et le test tient la parité.
 */
export const CLIENT_NOTE_TITLE_MAX = 80;

/** **2000 caractères** de description, facultative. Copie au contrat. */
export const CLIENT_NOTE_BODY_MAX = 2000;

const NOTE_CONTENT_RULES: PhotoCardContentRules = {
  titleMax: CLIENT_NOTE_TITLE_MAX,
  bodyMax: CLIENT_NOTE_BODY_MAX,
  refusals: {
    emptyTitle: () => new InvalidClientNoteError("le titre est vide. Donnez un titre à la note."),
    titleTooLong: (length, max) =>
      new InvalidClientNoteError(
        `le titre fait ${length} caractères, ${max} au plus. ` +
          "Raccourcissez-le et mettez le détail dans la description.",
      ),
    bodyTooLong: (length, max) =>
      new InvalidClientNoteError(
        `la description fait ${length} caractères, ${max} au plus. ` +
          "Résumez-la : la photo garde la note entière.",
      ),
  },
};

/**
 * **Le titre et la description d'une note.**
 *
 * Un value object validé AVANT de ranger la photo au stockage : un titre vide
 * connu dès la réception ne doit pas coûter un aller-retour réseau. La règle est
 * celle du socle des cartes à photo ; les bornes et les mots sont ceux du carnet.
 */
export class ClientNoteContent {
  private constructor(
    readonly title: string,
    readonly body: string,
  ) {}

  /**
   * Nettoie (espaces de bord) et valide.
   *
   * @throws {InvalidClientNoteError} titre vide, titre ou description trop long.
   */
  static create(input: { readonly title: string; readonly body: string }): ClientNoteContent {
    const { title, body } = readPhotoCardContent(input, NOTE_CONTENT_RULES);
    return new ClientNoteContent(title, body);
  }
}
