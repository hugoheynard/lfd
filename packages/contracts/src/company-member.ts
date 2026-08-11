import { z } from "zod";

/**
 * Les **interlocuteurs** d'une société, et l'accès que certains d'entre eux ont
 * à son espace.
 *
 * Une seule notion, pas deux : le responsable réception qui prend les livraisons
 * et le gérant qui commande sont tous deux des interlocuteurs — l'un a un accès,
 * l'autre non. En faire deux listes dupliquerait les mêmes gens et laisserait se
 * demander laquelle fait foi. Donner un accès reste pour autant une **décision**
 * explicite, pas la conséquence d'avoir noté un numéro de téléphone.
 */

/**
 * Ce qu'une personne fait **dans cette société-là**.
 *
 * - `owner` — le détenteur : celui dont l'adresse a ouvert le compte ;
 * - `admin` — administre l'espace : interlocuteurs, adresses, identité ;
 * - `orders` — passe les commandes ;
 * - `billing` — suit les règlements et les factures.
 *
 * Le rôle appartient au rattachement, pas à la personne : on peut administrer
 * une société et n'être que « commandes » dans une autre.
 */
export const companyMemberRoleSchema = z.enum(["owner", "admin", "orders", "billing"]);

export type CompanyMemberRole = z.infer<typeof companyMemberRoleSchema>;

/**
 * Les rôles qu'on **attribue**. `owner` en est absent, et ce n'est pas un oubli :
 * le détenteur n'est pas choisi, il est constaté — c'est celui dont l'adresse a
 * servi à ouvrir le compte. Le proposer dans un menu laisserait croire qu'on
 * peut en avoir deux, ou zéro.
 */
export const assignableRoleSchema = companyMemberRoleSchema.exclude(["owner"]);

export type AssignableRole = z.infer<typeof assignableRoleSchema>;

/**
 * La **seule** traduction des rôles, partagée par les deux frontends.
 *
 * Les valeurs vivent en anglais (base, API, code) et le français n'existe qu'à
 * l'écran : une valeur persistée dans la langue de l'interface se retrouve tôt
 * ou tard comparée à une chaîne traduite ailleurs, et c'est un bug qu'on ne voit
 * qu'en production. Un seul point de passage, donc — pas un `switch` par écran.
 */
export const COMPANY_ROLE_LABELS: Readonly<Record<CompanyMemberRole, string>> = {
  owner: "Détenteur du compte",
  admin: "Administrateur",
  orders: "Commandes",
  billing: "Facturation",
};

/**
 * Où en est l'accès.
 *
 * `invited` est un état **utile**, pas un détail technique : c'est la différence
 * entre « le client n'a pas encore posé son mot de passe » et « le client ne
 * s'est pas connecté depuis longtemps ». Sans lui, un commercial ne sait pas
 * s'il doit renvoyer le lien ou rappeler.
 */
export const companyMemberStatusSchema = z.enum(["invited", "active", "disabled"]);

export type CompanyMemberStatus = z.infer<typeof companyMemberStatusSchema>;

/**
 * Où en est l'**accès** d'un interlocuteur — l'état que la fiche affiche en
 * ticks.
 *
 * `none` est le cas le plus fréquent et parfaitement légitime : le responsable
 * réception qui prend les livraisons n'a aucune raison de se connecter. Ce n'est
 * donc pas un manque à corriger, c'est une situation à montrer telle quelle.
 */
export const contactAccessSchema = z.enum(["none", "invited", "active"]);

export type ContactAccess = z.infer<typeof contactAccessSchema>;

/**
 * Un interlocuteur d'une société — avec, s'il en a un, l'état de son **accès**.
 *
 * Une seule liste et non deux : une personne rattachée à une société est une
 * chose, et savoir si elle peut se connecter est un **état** de cette personne.
 * Deux listes dupliqueraient les mêmes gens, et on finirait par se demander
 * laquelle fait foi.
 */
export interface CompanyContactView {
  /** `null` pour le détenteur : il vit aplati sur la société, pas dans le carnet. */
  readonly contactId: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly fonction: string;
  readonly email: string;
  readonly phone: string;
  /** `null` sur les contacts d'avant les rôles — « à préciser », jamais deviné. */
  readonly role: CompanyMemberRole | null;
  readonly access: ContactAccess;
  /**
   * L'adresse a-t-elle été **prouvée** ? Faux tant qu'on ne l'a pas vérifié —
   * on ne présume pas d'un fait qui vit chez le fournisseur d'identité.
   */
  readonly emailVerified: boolean;
}

/** Une personne rattachée à une société, telle que les écrans la lisent. */
export interface CompanyMemberView {
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly role: CompanyMemberRole;
  readonly status: CompanyMemberStatus;
  /** Quand le rattachement a été créé (ISO-8601). */
  readonly joinedAt: string;
}

/**
 * Ouvrir un accès à quelqu'un.
 *
 * Pas de mot de passe ici, et il n'y en aura jamais : le mot de passe se pose
 * par un lien envoyé à l'adresse saisie, seule preuve que la personne contrôle
 * bien cette boîte. Un mot de passe choisi par le commercial serait un mot de
 * passe connu du commercial.
 */
export const inviteCompanyMemberPayloadSchema = z.object({
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phone: z.string().default(""),
  role: companyMemberRoleSchema,
});

export type InviteCompanyMemberPayload = z.infer<typeof inviteCompanyMemberPayloadSchema>;

/**
 * Le **détenteur** d'un compte : la personne à qui l'espace appartient.
 *
 * C'est la même personne que le « contact principal » de la société — les
 * séparer était une distinction de modèle sans réalité commerciale : celui qu'on
 * rappelle est celui qui se connecte. Un interlocuteur qui ne se connecte pas
 * est un `CompanyContact`, pas un détenteur.
 */
export const accountHolderPayloadSchema = z.object({
  email: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  fonction: z.string().default(""),
  phone: z.string().default(""),
});

export type AccountHolderPayload = z.infer<typeof accountHolderPayloadSchema>;

/**
 * Ce qu'on sait déjà d'une personne, cherchée par son adresse.
 *
 * Une même personne peut détenir **plusieurs** sociétés : le restaurateur qui
 * ouvre un second établissement, le gérant de deux enseignes. Lui refabriquer
 * une identité lui donnerait deux mots de passe pour une seule boîte e-mail, et
 * deux espaces là où il en veut un. Le commercial doit donc voir, **avant**
 * d'enregistrer, qu'il a affaire à un client connu.
 */
export interface CustomerLookupView {
  readonly userId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly status: CompanyMemberStatus;
  /** Les sociétés qu'il détient déjà — ce que la nouvelle viendra rejoindre. */
  readonly companies: readonly CustomerCompanyRef[];
}

/** Une société connue d'un client, réduite à ce qu'un écran en affiche. */
export interface CustomerCompanyRef {
  readonly id: string;
  readonly raisonSociale: string;
}

/**
 * Ce qui s'est **réellement** passé quand on a ouvert un accès.
 *
 * Trois issues, et non un booléen « déjà connu / pas connu » : le cas du milieu
 * est celui qu'un booléen faisait disparaître. Quelqu'un que nous connaissons
 * déjà peut n'avoir **jamais posé de mot de passe** — c'est l'état de tout
 * compte provisionné par un commercial dont l'e-mail n'est pas parti. Le
 * confondre avec un client actif, c'est lui écrire « retrouvez-le avec vos
 * identifiants habituels » alors qu'il n'en a aucun.
 *
 * - `identity_created` — identité neuve chez le fournisseur, lien envoyé ;
 * - `link_reissued` — personne connue mais **sans mot de passe** : nouveau lien ;
 * - `attached` — client actif : une société de plus dans son espace, sans lien.
 */
export const accessOutcomeSchema = z.enum(["identity_created", "link_reissued", "attached"]);

export type AccessOutcome = z.infer<typeof accessOutcomeSchema>;

/** L'issue a-t-elle envoyé un **lien de mot de passe** ? */
export function carriesPasswordLink(outcome: AccessOutcome): boolean {
  return outcome !== "attached";
}

/**
 * Le résultat d'une invitation.
 *
 * `mailSent` dit la vérité sur le canal : quand le mailer n'est pas configuré ou
 * qu'il a refusé, l'accès existe quand même mais **personne n'a rien reçu**. Le
 * commercial doit l'apprendre tout de suite, pas par le client une semaine plus
 * tard.
 *
 * Le lien de création de mot de passe, lui, n'est **jamais** renvoyé ici : il
 * vaut prise de contrôle du compte, et sa seule destination légitime est la
 * boîte du client.
 */
export interface CompanyMemberInvitedView {
  readonly member: CompanyMemberView;
  readonly outcome: AccessOutcome;
  readonly mailSent: boolean;
}
