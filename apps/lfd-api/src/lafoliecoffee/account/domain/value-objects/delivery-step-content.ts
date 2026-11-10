import {
  type PhotoCardContentRules,
  readPhotoCardContent,
} from "../../../shared/photo-cards/domain/value-objects/photo-card-content.js";
import { InvalidDeliveryStepError } from "../errors/delivery-procedure-errors.js";

/**
 * **80 caractères** : un titre se lit d'un coup d'œil, sur le trottoir.
 * `@lfd/contracts` en garde une copie (`DELIVERY_STEP_TITLE_MAX`) ; l'autorité
 * est ici.
 */
export const DELIVERY_STEP_TITLE_MAX = 80;

/** **1000 caractères** pour le texte, facultatif. Copie au contrat. */
export const DELIVERY_STEP_BODY_MAX = 1000;

/** Les longueurs d'une étape, et ses refus dans les mots de la procédure. */
const STEP_CONTENT_RULES: PhotoCardContentRules = {
  titleMax: DELIVERY_STEP_TITLE_MAX,
  bodyMax: DELIVERY_STEP_BODY_MAX,
  refusals: {
    emptyTitle: () => new InvalidDeliveryStepError("le titre est vide. Donnez un titre à l'étape."),
    titleTooLong: (length, max) =>
      new InvalidDeliveryStepError(
        `le titre fait ${length} caractères, ${max} au plus. ` +
          "Raccourcissez-le et mettez le détail dans le texte.",
      ),
    bodyTooLong: (length, max) =>
      new InvalidDeliveryStepError(
        `le texte fait ${length} caractères, ${max} au plus. Découpez-le en deux étapes.`,
      ),
  },
};

/**
 * **Le titre et le texte d'une étape.**
 *
 * Un value object plutôt que deux chaînes passées à l'agrégat, pour une raison
 * d'ordre : le handler valide le contenu AVANT de ranger la photo au stockage.
 * Valider dans l'agrégat seulement ferait ranger une photo pour une étape au
 * titre vide, puis la supprimer — un aller-retour réseau pour un refus qu'on
 * connaissait dès la réception.
 *
 * La règle (nettoyer, titre obligatoire, deux longueurs) est celle du socle des
 * cartes à photo ; les bornes et les mots sont ceux de la procédure.
 */
export class DeliveryStepContent {
  private constructor(
    readonly title: string,
    readonly body: string,
  ) {}

  /**
   * Nettoie (espaces de bord) et valide.
   *
   * @throws {InvalidDeliveryStepError} titre vide, titre ou texte trop long.
   */
  static create(input: { readonly title: string; readonly body: string }): DeliveryStepContent {
    const { title, body } = readPhotoCardContent(input, STEP_CONTENT_RULES);
    return new DeliveryStepContent(title, body);
  }
}
