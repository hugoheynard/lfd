import type { CompanyRole } from "../value-objects/company-role.js";

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
  /** `sub` du fournisseur d'identité — de quoi lui ré-émettre un lien. */
  readonly subject: string;
  readonly firstName: string;
  readonly status: MemberStatus;
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
   */
  abstract attach(userId: string, companyId: string, role: CompanyRole): Promise<void>;

  /**
   * Aligne le rôle d'un rattachement **existant**. Sans effet s'il n'y en a pas.
   *
   * C'est ce qui tient ensemble le rôle affiché sur la fiche (celui du contact)
   * et les droits réels (ceux du rattachement) : sans cela, corriger un rôle à
   * l'écran ne changerait rien à ce que la personne peut faire.
   */
  abstract alignRole(userId: string, companyId: string, role: CompanyRole): Promise<void>;

  /** Le rattachement (userId, companyId), ou `null` s'il n'existe pas. */
  abstract findMember(userId: string, companyId: string): Promise<CompanyMemberRecord | null>;

  /**
   * Le **détenteur** actuel de la société, `null` s'il n'y en a pas encore.
   *
   * Sert à tenir l'invariant « un seul détenteur » : il ne s'attribue pas, donc
   * il ne se duplique pas non plus.
   */
  abstract findOwner(companyId: string): Promise<KnownAccount | null>;
}
