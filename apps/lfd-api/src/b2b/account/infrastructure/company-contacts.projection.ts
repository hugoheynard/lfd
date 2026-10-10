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
   * Quand l'invitation **à cette société** a été émise ou renouvelée — celle du
   * rattachement, pas du compte : la même personne peut avoir été invitée
   * ailleurs il y a un an et ici hier. Lue sur `memberships.invited_at` depuis
   * le 2026-10-10, comme l'entrée : jusque-là `created_at`, qu'un lien remis
   * ne renouvelait pas, et l'écran disait « expirée » d'une invitation que
   * l'entrée aurait acceptée.
   */
  readonly invitedAt: Date;
  /** Quand la personne est entrée par ce rattachement ; `null` = pas encore. */
  readonly acceptedAt: Date | null;
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
 * L'expiration est calculée ici plutôt que lue en base, avec la même règle
 * (`isInvitationExpired`) que l'entrée, qui refuse une invitation expirée
 * depuis le 2026-10-10 (`customer-principal.resolver.ts`,
 * `unknown-subject-admission.ts`). ⚠️ Ce commentaire citait un « balayage qui
 * révoque pour de bon […] quelques fois par jour » : il n'a jamais existé
 * (vérifié le 2026-10-10 — `ExpireStaleInvitationsCommand` n'est écrite nulle
 * part). Rien n'est balayé ; c'est l'entrée qui refuse.
 *
 * L'état se lit sur le RATTACHEMENT : non accepté, il est `invited` tant que
 * son invitation vit et `expired` ensuite — même pour une personne active
 * ailleurs, que l'entrée ne laisse pas non plus ouvrir cette société.
 */
function accessState(row: AccessRow | undefined, now: Date): AccessState {
  if (row === undefined) {
    return { access: "none", emailVerified: false };
  }
  if (row.status === "disabled" || row.acceptedAt !== null) {
    return { access: toAccess(row.status), emailVerified: row.emailVerified };
  }
  const expired = isInvitationExpired(row.invitedAt, now);
  return { access: expired ? "expired" : "invited", emailVerified: row.emailVerified };
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
