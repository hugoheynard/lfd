/**
 * **La lecture publiée de la nature « maison »** (`restaurants-maison.md`) :
 * le compte la possède, et les passations la lisent par ce port,
 * jamais par la table `payer_in_house`. Une seule question, une seule méthode.
 */
export abstract class InHousePayerReader {
  /** Le payeur est-il un de nos restaurants ? Un identifiant inconnu ne l'est pas. */
  abstract isInHousePayer(payerId: string): Promise<boolean>;
}
