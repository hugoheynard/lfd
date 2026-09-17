import type { AssignableRole, CompanyRole } from "../value-objects/company-role.js";

/** Cycle de vie d'un accès, tel que la persistance le rend. */
export type MemberStatus = "invited" | "active" | "disabled";

/**
 * Une personne rattachée à une société, telle que la persistance la rend. Aucune
 * colonne système : le domaine ne connaît ni `created_at` ni `updated_at`.
 */
export interface CompanyMemberRecord {
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly role: CompanyRole;
  readonly status: MemberStatus;
  readonly joinedAt: Date;
}

/** Une identité à ouvrir, une fois qu'on sait son `sub` chez le fournisseur. */
export interface MemberToCreate {
  readonly subject: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  /** Le `sub` du staff qui provisionne — trace, pas autorisation. */
  readonly invitedBy: string;
}

/**
 * Une personne que nous connaissons déjà, **et où elle en est**.
 *
 * Le `status` est le champ qui compte : `invited` veut dire que l'identité
 * existe mais que **personne n'a jamais posé de mot de passe** dessus. Ne rendre
 * qu'un identifiant ferait passer cette personne pour une cliente installée, et
 * lui vaudrait un e-mail lui demandant d'utiliser des identifiants qu'elle n'a
 * pas.
 *
 * `firstName` vient de SON profil, jamais de ce qu'un commercial a tapé : son
 * nom lui appartient, et celui qui la note « Claire Vasser » ne doit pas la
 * renommer dans l'e-mail qu'elle reçoit.
 */
export interface KnownAccount {
  readonly userId: string;
  /**
   * `sub` du fournisseur d'identité — de quoi lui ré-émettre un lien.
   *
   * 🔴 **`null` = un INVITÉ** : quelqu'un qui a commandé sans compte, connu par
   * son adresse et par elle seule (plan `plan-commande-sans-compte.md`, D1). Il
   * n'y a alors AUCUNE identité chez le fournisseur, donc aucun lien à
   * ré-émettre : l'ouverture d'accès doit en **provisionner** une, et non
   * demander un ticket pour un sujet qui n'existe pas.
   *
   * Ne pas le confondre avec `status === "invited"`, qui dit l'inverse :
   * l'identité existe, c'est le mot de passe qui n'a jamais été posé.
   */
  readonly subject: string | null;
  readonly firstName: string;
  readonly status: MemberStatus;
  /**
   * L'adresse a-t-elle été **prouvée** ? Un compte `active` non vérifié est une
   * inscription libre : n'importe qui a pu taper l'adresse. C'est ce qui décide
   * si on peut lui rattacher une société.
   */
  readonly emailVerified: boolean;
}

/**
 * **Lecture** des accès d'une société. Séparé de l'écriture (ISP) : l'écran qui
 * liste n'a aucun besoin de pouvoir provisionner, et le handler qui provisionne
 * n'a aucun besoin de savoir agréger une liste.
 */
export abstract class CompanyMemberReader {
  abstract listOf(companyId: string): Promise<readonly CompanyMemberRecord[]>;
}

/** **Écriture** des accès : ouvrir une identité, la rattacher, la retrouver. */
export abstract class CompanyMemberRepository {
  /**
   * Ce qu'on sait de la personne portant cet e-mail, `null` si l'adresse est
   * libre.
   *
   * C'est ce qui distingue trois situations, et non deux : inconnue (on ouvre
   * une identité), connue mais sans mot de passe (on lui en renvoie un lien),
   * ou cliente active (une société de plus dans son espace). La même personne
   * peut travailler pour deux sociétés clientes, et lui créer une seconde
   * identité lui donnerait deux mots de passe pour une seule boîte e-mail.
   *
   * **Égalité exacte** sur la forme normalisée (blancs, casse), jamais un motif :
   * `jean_dupont@` ne désigne pas `jeanXdupont@`.
   *
   * @throws {AccountEmailAmbiguousError} plusieurs comptes portent l'adresse.
   *   La colonne n'est pas unique ; choisir l'un d'eux serait arbitraire.
   */
  abstract findAccountByEmail(email: string): Promise<KnownAccount | null>;

  /** Crée la personne, en attente de son premier mot de passe. Rend son id. */
  abstract createInvited(input: MemberToCreate): Promise<string>;

  /**
   * Réaligne le `sub` d'une personne sur celui que le fournisseur d'identité
   * lui reconnaît **aujourd'hui**.
   *
   * Nos deux bases peuvent diverger — un compte ouvert pendant que l'adaptateur
   * de développement fabriquait des sujets `dev|…`, une identité supprimée chez
   * Auth0 — et un sujet périmé rend la personne **définitivement** injoignable :
   * chaque demande de lien échoue exactement pareil, et rien ne la répare de
   * soi-même.
   *
   * L'adresse, elle, n'a pas bougé : c'est par elle qu'on retrouve la bonne
   * identité, et c'est ce résultat-là qu'on réécrit ici. Jamais la clé humaine,
   * seulement le pointeur technique.
   */
  abstract rebindSubject(userId: string, subject: string): Promise<void>;

  /**
   * Rattache une personne à une société avec un rôle — **ou aligne son rôle**
   * si elle l'est déjà.
   *
   * Idempotent par nécessité : ré-ouvrir l'accès de quelqu'un est le geste
   * courant (le lien s'est perdu), et il ne doit ni échouer ni laisser un rôle
   * périmé. Un rattachement qui ignorerait le rôle demandé afficherait un rôle
   * à l'écran et en appliquerait un autre.
   *
   * 🔴 **Un rattachement `owner` n'est jamais modifié** : l'adaptateur ne le
   * touche pas, quel que soit le rôle demandé. Rétrograder le détenteur par ce
   * chemin doit être inexprimable ; le refus lisible est à l'appelant
   * (`ensureHolderKeepsOwnership`). Promouvoir un rattachement existant en
   * `owner` reste possible — c'est le rattachement du détenteur d'un compte
   * ouvert sans lui — et l'index `memberships_one_owner` en garde l'unicité.
   */
  abstract attach(userId: string, companyId: string, role: CompanyRole): Promise<void>;

  /**
   * Aligne le rôle d'un rattachement **existant**. Sans effet s'il n'y en a pas.
   *
   * C'est ce qui tient ensemble le rôle affiché sur la fiche (celui du contact)
   * et les droits réels (ceux du rattachement) : sans cela, corriger un rôle à
   * l'écran ne changerait rien à ce que la personne peut faire.
   *
   * 🔴 **Sans effet non plus sur un rattachement `owner`**, et c'est tenu dans
   * la requête : le rôle attribuable n'est jamais `owner`, donc aligner le
   * détenteur ne pourrait que le rétrograder.
   */
  abstract alignRole(userId: string, companyId: string, role: AssignableRole): Promise<void>;

  /** Le rattachement (userId, companyId), ou `null` s'il n'existe pas. */
  abstract findMember(userId: string, companyId: string): Promise<CompanyMemberRecord | null>;

  /**
   * Le **détenteur** actuel de la société, `null` s'il n'y en a pas encore.
   *
   * Sert à REFUSER LISIBLEMENT un second détenteur — pas à l'empêcher. La
   * nuance a compté : cette lecture précède l'écriture, et la phrase qui tenait
   * ici (« il ne s'attribue pas, donc il ne se duplique pas non plus ») décrivait
   * une intention, pas un mécanisme. Deux commerciaux ouvrant l'accès détenteur
   * à la même société dans la même seconde lisent tous les deux `null`.
   *
   * Ce qui l'empêche, depuis le 2026-09-03, est l'index unique partiel
   * `memberships_one_owner`. Cette lecture reste : c'est elle qui nomme le cas
   * et le geste de sortie, là où la base ne sait dire que « doublon ».
   */
  abstract findOwner(companyId: string): Promise<KnownAccount | null>;
}
