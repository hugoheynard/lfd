import type { AssignableRole } from "../value-objects/company-role.js";
import type { ContactDetails } from "../value-objects/contact-details.js";

/**
 * Port d'**écriture** des contacts additionnels d'une entreprise.
 *
 * Chaque méthode porte `companyId` : c'est le mur. Une mise à jour ou une
 * suppression qui viserait un contact d'une **autre** entreprise ne doit rien
 * toucher — l'implémentation filtre sur les deux (`id` ET `companyId`), et signale
 * l'absence plutôt que d'agir à l'aveugle.
 */
export abstract class CompanyContactRepository {
  /**
   * Ajoute un contact à l'entreprise et renvoie son identifiant.
   *
   * Le rôle est **exigé** : noter un interlocuteur sans dire ce qu'il fait
   * produit une ligne dont personne ne saura quoi faire six mois plus tard. Il
   * ne peut pas valoir `owner` — le détenteur n'est pas un contact du carnet.
   */
  abstract add(companyId: string, details: ContactDetails, role: AssignableRole): Promise<string>;

  /**
   * Remplace un contact de l'entreprise.
   * @throws {CompanyContactNotFoundError} l'`id` n'appartient pas à `companyId`.
   */
  abstract update(
    companyId: string,
    contactId: string,
    details: ContactDetails,
    role: AssignableRole,
  ): Promise<void>;

  /**
   * Retire un contact de l'entreprise.
   * @throws {CompanyContactNotFoundError} l'`id` n'appartient pas à `companyId`.
   */
  abstract remove(companyId: string, contactId: string): Promise<void>;
}
