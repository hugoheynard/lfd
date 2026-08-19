import type { CompanyContactView, ContactAccess } from "@lfd/contracts";

import type { CustomerRole, UserStatus } from "../../../platform/database/client/client.js";
import { isInvitationExpired } from "../../../platform/shared/invitation/invitation-expiry.js";

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
  /**
   * Quand elle a été rattachée **à cette société** — la date du membership, pas
   * celle du compte : la même personne peut avoir été invitée ailleurs il y a un
   * an et ici hier.
   */
  readonly attachedAt: Date;
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
  now: Date,
): readonly CompanyContactView[] {
  const byEmail = new Map(access.map((row) => [key(row.email), row]));
  const stateOf = (row: AccessRow | undefined): AccessState => accessState(row, now);
  return [
    ...holderCard(holder, byEmail, stateOf),
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

/**
 * Le détenteur en tête de liste — **ou personne**.
 *
 * Une société s'ouvre désormais sur sa seule enseigne, et ses colonnes de contact
 * sont alors vides. Les projeter quand même rendait une carte fantôme : « Fonction
 * — / E-mail (vide) / Téléphone — », avec le bouton « ouvrir l'accès » offert
 * dessus. Et ce bouton **partait** : l'adresse vide traversait tout, jusqu'à
 * rattacher comme propriétaire la personne dont la colonne e-mail est vide.
 *
 * L'adresse décide, parce que c'est elle qui fait le détenteur : c'est par elle
 * qu'il se connecte, et c'est le seul champ que le rattachement exige.
 */
function holderCard(
  holder: HolderRow,
  byEmail: ReadonlyMap<string, AccessRow>,
  stateOf: (row: AccessRow | undefined) => AccessState,
): readonly CompanyContactView[] {
  if (key(holder.contactEmail) === "") {
    return [];
  }
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
  ];
}

/** L'état d'accès + la preuve de l'adresse. */
interface AccessState {
  readonly access: ContactAccess;
  readonly emailVerified: boolean;
}

/**
 * L'état d'accès, **échéance comprise**, ou l'absence des deux.
 *
 * L'expiration est calculée ici plutôt que lue en base : le balayage qui révoque
 * pour de bon ne passe que quelques fois par jour, et entre deux passages
 * l'écran doit dire la vérité — pas « invité » sur un lien mort depuis une
 * semaine. La règle, elle, n'est écrite qu'une fois (`isInvitationExpired`) et
 * sert aux deux.
 */
function accessState(row: AccessRow | undefined, now: Date): AccessState {
  if (row === undefined) {
    return { access: "none", emailVerified: false };
  }
  if (row.status === "invited" && isInvitationExpired(row.attachedAt, now)) {
    return { access: "expired", emailVerified: row.emailVerified };
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
