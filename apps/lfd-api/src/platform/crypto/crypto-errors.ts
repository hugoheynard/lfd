import { TechnicalError } from "../shared/errors/app-error.js";

/**
 * Un scellé qu'on ne sait pas rouvrir.
 *
 * **`TechnicalError` et non `DomainError`**, et la distinction n'est pas
 * cosmétique : `AppErrorFilter` neutralise le message des erreurs techniques
 * avant de répondre. Un échec d'ouverture nomme forcément un état du coffre —
 * clé changée, colonne corrompue — et c'est exactement ce qu'on ne raconte pas
 * à un client.
 *
 * Elle ne porte donc ni la valeur, ni le scellé : ils n'aideraient personne à
 * réparer, et un scellé recopié dans un journal est un scellé qui attend sa clé.
 */
export class SealedValueUnreadableError extends TechnicalError {
  constructor(reason: string) {
    super("platform.cipher.unreadable", `Valeur scellée illisible : ${reason}`);
  }
}

/** La clé manque, ou n'a pas la taille qu'AES-256 exige. */
export class FieldEncryptionKeyError extends TechnicalError {
  constructor(reason: string) {
    super("platform.cipher.key_invalid", `Clé de chiffrement des champs : ${reason}`);
  }
}
