/**
 * Le destinataire du récapitulatif, et **qui** il désigne : un identifiant
 * stable (`contact:<id>`, `user:<id>`), jamais l'adresse — c'est lui qui
 * entre dans la clé de l'e-mail (`lint:mail-key-no-pii`).
 */
export interface RecapRecipient {
  readonly id: string;
  readonly email: string;
}

/**
 * **À qui part le récapitulatif** (`restaurants-maison.md`) : le
 * destinataire de la facture du payeur — son contact de facturation le plus
 * ancien, à défaut son détenteur —, la règle même de « Votre facture ».
 * `null` : personne à prévenir, jamais une adresse devinée.
 */
export abstract class RecapRecipientReader {
  abstract recipientOf(payerId: string): Promise<RecapRecipient | null>;
}
