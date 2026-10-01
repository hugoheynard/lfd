import { DepositPhotoMissingError } from "../errors/delivery-doorstep-errors.js";
import { type ReceiptPicture, receiptPicture } from "./doorstep-receipt.js";

/**
 * **La pièce d'un dépôt** (`plan-a-la-porte.md`, B2, § 9) : la photo, et elle
 * seule. Personne n'a réceptionné — il n'y a ni nom ni signature à prendre,
 * et une commande dont la signature est exigée ne se dépose jamais (AP-Q6,
 * tenu par `DoorstepStop.ensureDepositPermitted`).
 *
 * Refusée AVANT tout envoi au stockage, comme les pièces d'une remise.
 */
export class DoorstepDeposit {
  private constructor(readonly photo: ReceiptPicture) {}

  /**
   * @throws {DepositPhotoMissingError}
   * @throws {InvalidHandoverPictureError} l'image est vide, trop lourde, ou d'un format inconnu.
   */
  static take(photo: Buffer | null): DoorstepDeposit {
    if (photo === null) {
      throw new DepositPhotoMissingError();
    }
    return new DoorstepDeposit(receiptPicture("photo", photo));
  }
}
