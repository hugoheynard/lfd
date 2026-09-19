import type { DeliveryAddressBook } from "../entities/delivery-address-book.js";
import { CompanyAddressNotFoundError } from "../errors/account-errors.js";

/**
 * **Les noms que le journal fige** (lot B du plan
 * `documentation/journalisation/plan-phrases-du-journal.md`, D5 et D6,
 * 2026-09-19).
 *
 * Un fait cite ce dont il parle avec son nom **du moment** : une société
 * renommée depuis doit se lire, sur les lignes d'avant, sous l'ancien nom. Le
 * journal dit ce qui était vrai quand c'est arrivé — la règle qu'il applique
 * déjà à l'auteur (`actorName`) et au client d'une commande (`clientName`).
 */

/** Un objet cité avec son nom du moment : l'id pour les liens, le nom pour la lecture. */
export interface NamedRef {
  readonly id: string;
  readonly name: string;
}

/**
 * Une **personne** citée : son id, et son nom seulement s'il est connu. Le nom
 * est facultatif dans le domaine (`PersonName.optional`), et l'e-mail n'en tient
 * jamais lieu : c'est une coordonnée.
 */
export interface PersonRef {
  readonly id: string;
  readonly name?: string;
}

/** « Prénom Nom », ou rien quand la fiche n'en porte aucun. */
export function personName(firstName: string, lastName: string): string | null {
  const name = `${firstName} ${lastName}`.trim();
  return name === "" ? null : name;
}

/** Le contact d'une fiche, cité avec son nom saisi s'il en a un — jamais son adresse. */
export function contactRef(
  contactId: string,
  details: {
    readonly firstName: { readonly value: string };
    readonly lastName: { readonly value: string };
  },
): PersonRef {
  return personRef(contactId, personName(details.firstName.value, details.lastName.value));
}

/** La personne citée, son nom omis plutôt que vide. */
export function personRef(id: string, name: string | null): PersonRef {
  return name === null ? { id } : { id, name };
}

/**
 * Une adresse de livraison **citée** : son id, sa ville et son code postal —
 * comme le staff la journalise (`placeOf`, décision de Hugo du 2026-09-19,
 * `a151ccee`). Jamais son libellé : c'est un texte libre saisi par le client,
 * et rien ne garantit qu'il ne porte pas une coordonnée de personne. Ni le
 * numéro ni la rue.
 */
export interface DeliveryAddressRef {
  readonly id: string;
  readonly ville: string;
  readonly codePostal: string;
}

/** Une société citée sous le nom qu'affichent les écrans — l'enseigne, à défaut la raison sociale. */
export function companyNamed(companyId: string, company: { displayName(): string }): NamedRef {
  return { id: companyId, name: company.displayName() };
}

/**
 * Une adresse du carnet, citée par son lieu — lue AVANT qu'un archivage la
 * retire.
 *
 * @throws {CompanyAddressNotFoundError} l'adresse n'est pas (ou plus) au carnet.
 */
export function deliveryAddressOf(
  book: DeliveryAddressBook,
  addressId: string,
): DeliveryAddressRef {
  const entry = book.deliveries().find((candidate) => candidate.id === addressId);
  if (entry === undefined) {
    throw new CompanyAddressNotFoundError(addressId);
  }
  return { id: addressId, ville: entry.lines.ville, codePostal: entry.lines.codePostal };
}
