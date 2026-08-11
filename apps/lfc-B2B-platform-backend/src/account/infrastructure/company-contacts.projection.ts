import type { CompanyContactView, ContactAccess } from "@lfd/contracts";

import type { CustomerRole, UserStatus } from "../../infra/database/client/client.js";

/** Le détenteur, tel qu'il vit aplati sur la société. */
export interface HolderRow {
  readonly contactPrenom: string;
  readonly contactNom: string;
  readonly contactFonction: string;
  readonly contactEmail: string;
  readonly contactTelephone: string;
}

/** Un interlocuteur du carnet d'adresses. */
export interface ContactRow {
  readonly id: string;
  readonly prenom: string;
  readonly nom: string;
  readonly fonction: string;
  readonly email: string;
  readonly telephone: string;
  readonly role: CustomerRole | null;
}

/** Une personne qui a un accès à cette société-là. */
export interface AccessRow {
  readonly email: string;
  readonly status: UserStatus;
  readonly emailVerified: boolean;
}

/**
 * Projette **une seule** liste d'interlocuteurs : le détenteur en tête, puis le
 * carnet — chacun portant l'état de son accès.
 *
 * L'accès n'est pas une seconde liste mais un **état** de la personne. Le
 * responsable réception qui prend les livraisons n'a aucune raison de se
 * connecter : `none` est le cas le plus fréquent et parfaitement légitime, pas
 * un manque à corriger.
 *
 * Le rapprochement se fait sur l'**adresse**, normalisée : c'est la seule clé
 * humaine commune entre un contact noté au téléphone et une identité créée chez
 * le fournisseur. Un contact sans accès n'a pas de ligne côté membres, et c'est
 * exactement ce qu'on veut lire.
 */
export function projectContacts(
  holder: HolderRow,
  book: readonly ContactRow[],
  access: readonly AccessRow[],
): readonly CompanyContactView[] {
  const byEmail = new Map(access.map((row) => [key(row.email), row]));
  return [
    {
      // `null` : le détenteur n'est pas une ligne du carnet, il EST la société.
      contactId: null,
      firstName: holder.contactPrenom,
      lastName: holder.contactNom,
      fonction: holder.contactFonction,
      email: holder.contactEmail,
      phone: holder.contactTelephone,
      // Constaté, jamais choisi : c'est l'adresse qui a ouvert le compte.
      role: "owner",
      ...stateOf(byEmail.get(key(holder.contactEmail))),
    },
    ...book.map((contact) => ({
      contactId: contact.id,
      firstName: contact.prenom,
      lastName: contact.nom,
      fonction: contact.fonction,
      email: contact.email,
      phone: contact.telephone,
      // `null` sur les contacts d'avant les rôles : « à préciser » à l'écran.
      // Le deviner propagerait une valeur inventée qu'on ne saurait plus
      // distinguer d'une vraie.
      role: contact.role,
      ...stateOf(byEmail.get(key(contact.email))),
    })),
  ];
}

/** L'état d'accès + la preuve de l'adresse, ou l'absence des deux. */
function stateOf(row: AccessRow | undefined): {
  access: ContactAccess;
  emailVerified: boolean;
} {
  if (row === undefined) {
    return { access: "none", emailVerified: false };
  }
  return { access: toAccess(row.status), emailVerified: row.emailVerified };
}

/**
 * Un compte **désactivé** se lit `none` : la question posée à l'écran est « cette
 * personne peut-elle entrer ? », et la réponse est non. Le distinguer visuellement
 * demanderait un 4e état pour un cas que le staff ne produit pas encore.
 */
function toAccess(status: UserStatus): ContactAccess {
  if (status === "active") {
    return "active";
  }
  return status === "invited" ? "invited" : "none";
}

/** Clé de rapprochement — l'adresse ne se compare jamais telle quelle. */
function key(email: string): string {
  return email.trim().toLowerCase();
}
