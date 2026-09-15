import { InvalidDeliveryStepError } from "../errors/delivery-procedure-errors.js";

/**
 * **80 caractères** : un titre se lit d'un coup d'œil, sur le trottoir.
 * `@lfd/contracts` en garde une copie (`DELIVERY_STEP_TITLE_MAX`) ; l'autorité
 * est ici.
 */
export const DELIVERY_STEP_TITLE_MAX = 80;

/** **1000 caractères** pour le texte, facultatif. Copie au contrat. */
export const DELIVERY_STEP_BODY_MAX = 1000;

/**
 * **Le titre et le texte d'une étape.**
 *
 * Un value object plutôt que deux chaînes passées à l'agrégat, pour une raison
 * d'ordre : le handler valide le contenu AVANT de ranger la photo au stockage.
 * Valider dans l'agrégat seulement ferait ranger une photo pour une étape au
 * titre vide, puis la supprimer — un aller-retour réseau pour un refus qu'on
 * connaissait dès la réception.
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
    const title = input.title.trim();
    const body = input.body.trim();
    if (title === "") {
      throw new InvalidDeliveryStepError("le titre est vide. Donnez un titre à l'étape.");
    }
    if (title.length > DELIVERY_STEP_TITLE_MAX) {
      throw new InvalidDeliveryStepError(
        `le titre fait ${title.length} caractères, ${DELIVERY_STEP_TITLE_MAX} au plus. ` +
          "Raccourcissez-le et mettez le détail dans le texte.",
      );
    }
    if (body.length > DELIVERY_STEP_BODY_MAX) {
      throw new InvalidDeliveryStepError(
        `le texte fait ${body.length} caractères, ${DELIVERY_STEP_BODY_MAX} au plus. ` +
          "Découpez-le en deux étapes.",
      );
    }
    return new DeliveryStepContent(title, body);
  }
}
