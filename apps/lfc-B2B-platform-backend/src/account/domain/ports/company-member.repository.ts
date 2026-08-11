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
 * **Lecture** des accès d'une société. Séparé de l'écriture (ISP) : l'écran qui
 * liste n'a aucun besoin de pouvoir provisionner, et le handler qui provisionne
 * n'a aucun besoin de savoir agréger une liste.
 */
export abstract class CompanyMemberReader {
  abstract listOf(companyId: string): Promise<readonly CompanyMemberRecord[]>;

  /**
   * Ce qu'on sait déjà de la personne portant cette adresse, `null` si elle nous
   * est inconnue.
   *
   * Sert **avant** d'ouvrir un compte : une même personne peut détenir plusieurs
   * sociétés (un second établissement, deux enseignes), et lui refabriquer une
   * identité lui donnerait deux mots de passe pour une seule boîte e-mail. Les
   * sociétés déjà détenues remontent avec, parce que c'est ce que le commercial
   * a besoin de voir pour reconnaître son interlocuteur.
   */
  abstract findCustomerByEmail(email: string): Promise<CustomerRecord | null>;

  /**
   * Les clients dont le nom ou l'adresse **contient** le terme cherché.
   *
   * Une recherche, pas une correspondance exacte : le commercial connaît le nom
   * de son interlocuteur, rarement l'orthographe exacte de son adresse. Le
   * résultat est borné (`limit`) — au-delà, la liste ne s'écrème plus à l'œil et
   * il vaut mieux affiner la recherche.
   */
  abstract searchCustomers(term: string, limit: number): Promise<readonly CustomerRecord[]>;
}

/** Une personne connue, et les sociétés auxquelles elle est rattachée. */
export interface CustomerRecord {
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly status: MemberStatus;
  readonly companies: readonly { readonly id: string; readonly raisonSociale: string }[];
}

/**
 * Une personne que nous connaissons déjà, **et où elle en est**.
 *
 * Le `status` est le champ qui compte : `invited` veut dire que l'identité
 * existe mais que **personne n'a jamais posé de mot de passe** dessus. Ne rendre
 * qu'un identifiant ferait passer cette personne pour un client installé, et lui
 * vaudrait un e-mail lui demandant d'utiliser des identifiants qu'elle n'a pas.
 */
export interface KnownAccount {
  readonly userId: string;
  /** `sub` du fournisseur d'identité — de quoi lui ré-émettre un lien. */
  readonly subject: string;
  readonly status: MemberStatus;
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
