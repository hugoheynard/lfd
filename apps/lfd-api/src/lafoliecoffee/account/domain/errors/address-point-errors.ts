import { DomainError } from "../../../../platform/shared/errors/app-error.js";

/**
 * Un point d'adresse (porte ou stationnement) hors des bornes terrestres. Ne
 * vient pas d'une saisie : la correction part d'une suggestion calculée, et ce
 * refus dit qu'elle est fausse — on n'écrit pas un point qu'on ne sait pas lire.
 */
export class InvalidAddressPointError extends DomainError {
  constructor() {
    super(
      "account.address.invalid_point",
      "Point GPS invalide : la latitude va de -90 à 90, la longitude de -180 à 180. Rien n'a été écrit au carnet.",
    );
  }
}
