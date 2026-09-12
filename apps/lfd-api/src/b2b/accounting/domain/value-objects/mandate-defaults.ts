import { MandateFieldTooLongError } from "../errors/accounting-errors.js";

/**
 * Le **type de paiement** d'un mandat — zone 12 du modèle EPC.
 *
 * Binaire, et c'est la norme qui le veut : le formulaire porte deux cases à
 * cocher, pas une liste. `recurrent` autorise une série de prélèvements ;
 * `one_off` n'en autorise **qu'un**, après quoi le mandat est mort.
 *
 * ⚠️ Ce n'est PAS le `SeqTp` d'un `pain.008` (`FRST`/`RCUR`/`OOFF`/`FNAL`), qui
 * décrit une échéance **dans** une série. Celui-ci décrit l'autorisation.
 */
export type MandatePaymentType = "recurrent" | "one_off";

/** La longueur au-delà de laquelle la zone 20 déborde de sa ligne pointillée. */
export const CONTRACT_DESCRIPTION_MAX_LENGTH = 90;

/**
 * **Ce que les mandats d'une entité disent du contrat qu'ils servent.**
 *
 * ## Pourquoi sur l'entité, et pas sur le compte d'un client
 *
 * Parce que ces deux réglages décrivent **ce que nous vendons**, pas ce que tel
 * client a acheté : la même phrase et le même régime sur tous les mandats qu'une
 * entité émet. Les poser par client ferait ressaisir la même chose à chaque
 * dossier, et deux formulations concurrentes finiraient par circuler chez des
 * clients voisins — qui se parlent.
 *
 * Ce qui reste par client : le **numéro** de contrat (zone 19) et le code du
 * débiteur (zone 14). Ceux-là désignent un dossier précis.
 *
 * ## La borne de la description, et d'où elle vient
 *
 * La zone 20 est une **ligne pointillée**, pas un peigne de cases : un
 * dépassement ne tronque rien, il déborde du cadre. Donc aucune donnée n'est
 * perdue — c'est la mise en page qui casse, et sur un document qu'on fait
 * signer, une phrase qui sort du cadre se lit comme un formulaire mal imprimé.
 */
export class MandateDefaults {
  private constructor(
    readonly contractDescription: string,
    readonly paymentType: MandatePaymentType,
  ) {}

  /** L'état d'une entité qui vient d'être déclarée : rien à dire, et récurrent. */
  static initial(): MandateDefaults {
    return new MandateDefaults("", "recurrent");
  }

  /**
   * @throws {MandateFieldTooLongError} la description dépasse la ligne.
   */
  static create(contractDescription: string, paymentType: MandatePaymentType): MandateDefaults {
    const description = contractDescription.trim();
    if (description.length > CONTRACT_DESCRIPTION_MAX_LENGTH) {
      throw new MandateFieldTooLongError(
        "La description du contrat",
        description.length,
        CONTRACT_DESCRIPTION_MAX_LENGTH,
      );
    }
    return new MandateDefaults(description, paymentType);
  }
}
