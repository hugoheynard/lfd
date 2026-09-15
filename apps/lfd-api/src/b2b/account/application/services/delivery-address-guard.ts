import { CompanyAddressNotFoundError } from "../../domain/errors/account-errors.js";
import type { CompanyAddressRepository } from "../../domain/ports/company-address.repository.js";

/**
 * Vérifie que l'adresse est une livraison **au carnet de cette société**, et
 * non archivée.
 *
 * Par le carnet et non par une requête ad hoc : c'est lui qui sait ce qu'est
 * « une adresse de livraison de cette société » (`DeliveryAddressBook.holds`).
 * Une adresse d'une autre société y est absente, une archivée aussi — les deux
 * rendent le même 404, et la procédure d'une adresse archivée cesse d'être
 * lisible sans qu'aucune ligne ne soit touchée.
 *
 * Partagée par les gestes client et staff, lecture comme écriture : la règle
 * est la même des deux côtés du mur, elle ne s'écrit qu'une fois.
 *
 * @throws {CompanyAddressNotFoundError} l'adresse n'est pas au carnet.
 */
export async function ensureDeliveryAddress(
  addresses: CompanyAddressRepository,
  companyId: string,
  addressId: string,
): Promise<void> {
  const book = await addresses.loadDeliveryBook(companyId);
  if (!book.holds(addressId)) {
    throw new CompanyAddressNotFoundError(addressId);
  }
}
