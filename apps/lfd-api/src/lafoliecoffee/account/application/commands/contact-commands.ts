import type { AssignableRole } from "../../domain/value-objects/company-role.js";
import type { ContactDetailsInput } from "../../domain/value-objects/contact-details.js";

/**
 * Les commandes de gestion des contacts d'une entreprise.
 *
 * Regroupées dans un fichier : ce sont quatre variations d'une même intention
 * (« gérer les contacts de cette entreprise »), elles partagent le même
 * porteur de coordonnées et le même acteur. Chacune garde **son** handler dédié.
 *
 * `actorUserId` accompagne toujours `companyId` : c'est contre le rôle de
 * l'acteur dans cette entreprise que le mur se vérifie.
 */

/** Met à jour le contact principal (carte « Admin du compte entreprise »). */
export class UpdatePrimaryContactCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly details: ContactDetailsInput,
  ) {}
}

/** Ajoute un contact additionnel — son rôle avec, jamais après coup. */
export class AddCompanyContactCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly details: ContactDetailsInput,
    readonly role: AssignableRole,
  ) {}
}

/** Remplace un contact additionnel. */
export class UpdateCompanyContactCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly contactId: string,
    readonly details: ContactDetailsInput,
    readonly role: AssignableRole,
  ) {}
}

/** Retire un contact additionnel. */
export class RemoveCompanyContactCommand {
  constructor(
    readonly actorUserId: string,
    readonly companyId: string,
    readonly contactId: string,
  ) {}
}
