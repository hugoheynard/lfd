import type { ContactDetailsInput } from "../../domain/value-objects/contact-details.js";

/**
 * Mutations de **contacts par le staff** (Porte B — « le commercial complète à
 * la place du client »).
 *
 * Jumelles assumées des commandes clientes, moins l'`actorUserId` : le staff
 * n'est membre d'aucune société, sa porte est le guard admin. Les fusionner
 * demanderait un acteur nullable et un `if` dans chaque handler — c'est-à-dire
 * un mur qui se désarme, exactement ce qu'un mur ne doit pas savoir faire.
 */
export class UpdatePrimaryContactByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly details: ContactDetailsInput,
  ) {}
}

export class AddContactByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly details: ContactDetailsInput,
  ) {}
}

export class UpdateContactByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly contactId: string,
    readonly details: ContactDetailsInput,
  ) {}
}

export class RemoveContactByStaffCommand {
  constructor(
    readonly companyId: string,
    readonly contactId: string,
  ) {}
}
