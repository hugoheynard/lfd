/**
 * Port de **lecture** du code postal d'une adresse de livraison — sert au calcul
 * du frais de zone à la passation. Renvoie `null` si l'adresse n'existe pas, ne
 * relève pas de l'entreprise, n'est pas une adresse de livraison, ou est archivée
 * (le port d'écriture re-valide l'appartenance dans la transaction).
 */
export abstract class DeliveryAddressReader {
  abstract postalCodeOf(companyId: string, addressId: string): Promise<string | null>;
}
