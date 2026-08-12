import { TechnicalError } from "./app-error.js";

/**
 * Le **fournisseur d'identité** a refusé, ou son canal n'est pas configuré.
 *
 * C'est **volontairement** une erreur technique et non un refus métier :
 * personne n'a rien fait de mal. Et c'est ce qui autorise l'appelant à renoncer
 * à son écriture locale — propager un e-mail chez nous mais pas chez le
 * fournisseur connecterait quelqu'un avec une adresse en lui en affichant une
 * autre.
 *
 * Elle vit dans `shared/` parce que le canal d'identité sert désormais deux
 * contextes — les clients et l'équipe — et qu'une panne du fournisseur n'est
 * pas un incident du contexte `account`.
 */
export class IdentityProviderUnavailableError extends TechnicalError {
  constructor(reason: string, cause?: unknown) {
    super("identity_provider.unavailable", reason, cause);
  }
}
