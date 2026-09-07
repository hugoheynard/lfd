/**
 * À **qui** écrire quand une commande vient d'être passée.
 *
 * Port volontairement minuscule, et c'est le sujet : l'annuaire des clients
 * expose un dépôt complet — lecture par e-mail, écriture du profil. Un abonné
 * qui n'a besoin que d'une adresse n'a pas à dépendre d'une interface qui sait
 * enregistrer. C'est l'ISP appliqué là où on l'oublie le plus souvent : sur les
 * dépendances qu'on prend « parce qu'elles existent déjà ».
 */

/** Ce qu'il faut pour écrire à quelqu'un : une adresse, et de quoi le nommer. */
export interface OrderRecipient {
  readonly email: string;
  readonly firstName: string;
}

export abstract class OrderRecipientReader {
  /**
   * Le destinataire d'une commande, ou `null` s'il est introuvable.
   *
   * `null` plutôt qu'une erreur : un client sans adresse lisible ne doit pas
   * faire échouer un abonné de fond, et surtout pas laisser croire que la
   * commande a mal tourné. Elle est passée ; c'est le courriel qui manque.
   */
  abstract findById(userId: string): Promise<OrderRecipient | null>;
}
