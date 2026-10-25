import { HANDOVER_RECEIVER_NAME_MAX, HANDOVER_RECEIVER_NAME_MIN } from "@lfd/contracts";

import {
  HandoverPhotoMissingError,
  type HandoverPiece,
  HandoverSignatureMissingError,
  InvalidHandoverPictureError,
  ReceiverNameLengthError,
  ReceiverNameRequiredError,
  SignedSlipPhotoMissingError,
} from "../errors/delivery-doorstep-errors.js";
import {
  INCIDENT_PHOTO_MAX_BYTES,
  type IncidentPhotoContentType,
  incidentPhotoContentType,
} from "./incident-photo.js";

/** Une image de la remise, relue dans ses octets. */
export interface ReceiptPicture {
  readonly bytes: Buffer;
  readonly contentType: IncidentPhotoContentType;
}

/** Ce que le livreur envoie à la porte, brut. */
export interface ReceiptInput {
  readonly receiverName: string;
  readonly photo: Buffer | null;
  readonly signature: Buffer | null;
  /** La photo du bon signé ; `null` : aucune. */
  readonly signedSlip: Buffer | null;
}

const BYTES_PER_MEGABYTE = 1024 * 1024;

/**
 * **Les pièces d'une remise au client** (`a-la-porte.md`, B1, § 9,
 * AP-Q2, AP-D4) : la photo, toujours ; la signature au doigt quand l'arrêt
 * l'exige ; le nom de qui réceptionne, de 2 à 80 caractères — OBLIGATOIRE
 * seulement avec la signature, facultatif sinon (Hugo, 2026-10-25 : un champ
 * vide vaut « personne n'est nommé », `null`).
 *
 * Deux temps, parce que la signature exigée ne se lit qu'avec l'arrêt :
 * `take` refuse ce qui est faux en soi (avant tout envoi au stockage),
 * `ensureSignedIf` refuse ce qui manque à CET arrêt (sous le verrou).
 *
 * Les images reprennent les formats et la borne de la photo d'un signalement :
 * le téléphone est le même. Une signature est un tracé exporté en image ; elle
 * passe par la même porte.
 */
export class DoorstepReceipt {
  private constructor(
    /** `null` : personne n'a été nommé — admis tant que l'arrêt n'exige pas de signature. */
    readonly receiverName: string | null,
    readonly photo: ReceiptPicture,
    readonly signature: ReceiptPicture | null,
    readonly signedSlip: ReceiptPicture | null,
  ) {}

  /**
   * @throws {HandoverPhotoMissingError} @throws {InvalidHandoverPictureError}
   * @throws {ReceiverNameLengthError}
   */
  static take(input: ReceiptInput): DoorstepReceipt {
    if (input.photo === null) {
      throw new HandoverPhotoMissingError();
    }
    const typed = input.receiverName.trim();
    const name = typed === "" ? null : typed;
    if (
      name !== null &&
      (name.length < HANDOVER_RECEIVER_NAME_MIN || name.length > HANDOVER_RECEIVER_NAME_MAX)
    ) {
      throw new ReceiverNameLengthError(
        name.length,
        HANDOVER_RECEIVER_NAME_MIN,
        HANDOVER_RECEIVER_NAME_MAX,
      );
    }
    return new DoorstepReceipt(
      name,
      receiptPicture("photo", input.photo),
      input.signature === null ? null : receiptPicture("signature", input.signature),
      input.signedSlip === null ? null : receiptPicture("signed-slip", input.signedSlip),
    );
  }

  get signed(): boolean {
    return this.signature !== null;
  }

  /**
   * La signature exigée au départ est-elle là ? Une signature jointe sans être
   * exigée est gardée : elle ne prouve que davantage.
   * Une signature exigée exige aussi le nom de qui signe et la photo du bon
   * signé (Hugo, 2026-10-25).
   *
   * @throws {HandoverSignatureMissingError} @throws {ReceiverNameRequiredError}
   * @throws {SignedSlipPhotoMissingError}
   */
  ensureSignedIf(signatureRequired: boolean, reference: string): void {
    if (!signatureRequired) {
      return;
    }
    if (this.signature === null) {
      throw new HandoverSignatureMissingError(reference);
    }
    if (this.receiverName === null) {
      throw new ReceiverNameRequiredError(reference);
    }
    if (this.signedSlip === null) {
      throw new SignedSlipPhotoMissingError(reference);
    }
  }
}

/**
 * Une image de la porte, relue dans ses octets — la même porte pour la remise
 * et le dépôt (`DoorstepDeposit`) : le téléphone est le même.
 *
 * @throws {InvalidHandoverPictureError}
 */
export function receiptPicture(piece: HandoverPiece, bytes: Buffer): ReceiptPicture {
  if (bytes.length === 0) {
    throw new InvalidHandoverPictureError(piece, "aucune image reçue.");
  }
  if (bytes.length > INCIDENT_PHOTO_MAX_BYTES) {
    throw new InvalidHandoverPictureError(
      piece,
      `elle pèse ${(bytes.length / BYTES_PER_MEGABYTE).toFixed(1)} Mo, la limite est de ` +
        `${(INCIDENT_PHOTO_MAX_BYTES / BYTES_PER_MEGABYTE).toFixed(1)} Mo.`,
    );
  }
  const contentType = incidentPhotoContentType(bytes);
  if (contentType === null) {
    throw new InvalidHandoverPictureError(
      piece,
      "un JPEG, un PNG, un WebP ou un HEIC est attendu.",
    );
  }
  return { bytes, contentType };
}
