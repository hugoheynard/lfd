import {
  CardPhoto,
  type CardPhotoRules,
  cardPhotoContentType,
  megabytes,
} from "../../../shared/photo-cards/domain/value-objects/card-photo.js";
import { InvalidDeliveryStepPhotoError } from "../errors/delivery-procedure-errors.js";

/**
 * **1 Mo.** L'écran réduit la photo avant l'envoi (1600 px de grand côté,
 * JPEG) : ce qui arrive au-delà n'a pas été réduit, et c'est un livreur sur un
 * trottoir qui la chargera.
 *
 * ⚠️ `@lfd/contracts` en garde une copie (`DELIVERY_STEP_PHOTO_MAX_BYTES`) pour
 * que l'écran énonce la borne. L'autorité est ici ; le test tient la parité.
 */
export const DELIVERY_STEP_PHOTO_MAX_BYTES = 1024 * 1024;

/** La borne d'une étape, et ses refus dans les mots de la procédure. */
const STEP_PHOTO_RULES: CardPhotoRules = {
  maxBytes: DELIVERY_STEP_PHOTO_MAX_BYTES,
  refusals: {
    empty: () => new InvalidDeliveryStepPhotoError("le fichier est vide. Reprenez la photo."),
    tooHeavy: (size, max) =>
      new InvalidDeliveryStepPhotoError(
        `elle pèse ${megabytes(size)} Mo, la limite est de ${megabytes(max)} Mo. ` +
          "Reprenez-la depuis l'écran de la procédure, qui la réduit avant l'envoi.",
      ),
    unsupportedFormat: () =>
      new InvalidDeliveryStepPhotoError(
        "un JPEG ou un PNG est attendu (ni HEIC, ni PDF). Enregistrez la photo dans l'un " +
          "de ces deux formats, puis déposez-la à nouveau.",
      ),
    truncated: () =>
      new InvalidDeliveryStepPhotoError(
        "l'image est tronquée : ses dimensions ne se lisent pas. Reprenez la photo.",
      ),
  },
};

/**
 * **La photo d'une étape de procédure de livraison** — le portail, la porte de
 * service, la boîte à clés.
 *
 * Bâtie sur `EntityLogo`, mais **plus large sur ce qui ne compte pas ici** : ni
 * taille minimale, ni ratio. Une photo de téléphone est rarement carrée, et une
 * photo floue d'un code de portail reste plus utile que pas de photo. Ce qui
 * reste refusé est ce qui coûterait au livreur (le poids) ou ne s'afficherait
 * pas (un format que l'écran ne dessine pas, une image tronquée).
 *
 * `create()` est le seul constructeur : une photo non conforme n'existe pas en
 * mémoire, donc ne part jamais au stockage.
 */
export class DeliveryStepPhoto {
  private constructor(
    readonly bytes: Buffer,
    readonly contentType: string,
  ) {}

  /**
   * Valide des octets déposés, selon la règle du socle des cartes à photo
   * (vide, poids, format aux octets, dimensions — dans cet ordre) et la borne
   * de l'étape.
   *
   * @throws {InvalidDeliveryStepPhotoError} vide, trop lourde, format refusé ou
   *   dimensions illisibles.
   */
  static create(bytes: Buffer): DeliveryStepPhoto {
    const photo = CardPhoto.create(bytes, STEP_PHOTO_RULES);
    return new DeliveryStepPhoto(photo.bytes, photo.contentType);
  }
}

/**
 * Le type d'une photo **déjà rangée**, relu dans ses octets — aucune colonne ne
 * le porte, et une colonne pourrait mentir là où huit octets ne le peuvent pas.
 *
 * `null` quand ce n'est ni un JPEG ni un PNG : pour un objet que seul
 * {@link DeliveryStepPhoto.create} a pu écrire, c'est une incohérence entre le
 * bucket et la base.
 */
export function deliveryStepPhotoContentType(bytes: Buffer): string | null {
  return cardPhotoContentType(bytes);
}

/**
 * La clé de rangement d'une photo d'étape.
 *
 * Ancrée sur la société (le mur de tenancy du stockage est dans le chemin),
 * puis l'adresse et l'étape. Le suffixe `revision` change à chaque dépôt : un
 * remplacement n'écrase jamais l'ancienne photo tant que la base ne pointe pas
 * vers la nouvelle, et l'écran invalide son image sur ce seul suffixe.
 */
export function deliveryStepPhotoKey(
  companyId: string,
  addressId: string,
  stepId: string,
  revision: string,
): string {
  return `companies/${companyId}/delivery-procedures/${addressId}/${stepId}-${revision}`;
}

/**
 * La révision portée par une clé — ce qui suit le dernier `-`. Les identifiants
 * sont des ULID, sans tiret : le dernier est donc celui que
 * {@link deliveryStepPhotoKey} a posé.
 */
export function deliveryStepPhotoRevision(photoKey: string): string {
  return photoKey.slice(photoKey.lastIndexOf("-") + 1);
}
