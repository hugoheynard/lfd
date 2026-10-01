import { HANDOVER_RECEIVER_NAME_MAX, HANDOVER_RECEIVER_NAME_MIN } from "@lfd/contracts";

import {
  HandoverPhotoMissingError,
  HandoverSignatureMissingError,
  InvalidHandoverPictureError,
  ReceiverNameLengthError,
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
}

const BYTES_PER_MEGABYTE = 1024 * 1024;

/**
 * **Les pièces d'une remise au client** (`plan-a-la-porte.md`, B1, § 9,
 * AP-Q2, AP-D4) : la photo, toujours ; le nom de qui réceptionne, toujours,
 * de 2 à 80 caractères ; la signature au doigt quand l'arrêt l'exige.
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
    readonly receiverName: string,
    readonly photo: ReceiptPicture,
    readonly signature: ReceiptPicture | null,
  ) {}

  /**
   * @throws {HandoverPhotoMissingError} @throws {InvalidHandoverPictureError}
   * @throws {ReceiverNameLengthError}
   */
  static take(input: ReceiptInput): DoorstepReceipt {
    if (input.photo === null) {
      throw new HandoverPhotoMissingError();
    }
    const name = input.receiverName.trim();
    if (name.length < HANDOVER_RECEIVER_NAME_MIN || name.length > HANDOVER_RECEIVER_NAME_MAX) {
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
    );
  }

  get signed(): boolean {
    return this.signature !== null;
  }

  /**
   * La signature exigée au départ est-elle là ? Une signature jointe sans être
   * exigée est gardée : elle ne prouve que davantage.
   *
   * @throws {HandoverSignatureMissingError}
   */
  ensureSignedIf(signatureRequired: boolean, reference: string): void {
    if (signatureRequired && this.signature === null) {
      throw new HandoverSignatureMissingError(reference);
    }
  }
}

/**
 * Une image de la porte, relue dans ses octets — la même porte pour la remise
 * et le dépôt (`DoorstepDeposit`) : le téléphone est le même.
 *
 * @throws {InvalidHandoverPictureError}
 */
export function receiptPicture(piece: "photo" | "signature", bytes: Buffer): ReceiptPicture {
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
