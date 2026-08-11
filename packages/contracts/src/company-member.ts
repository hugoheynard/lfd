import { z } from "zod";

/**
 * Les **personnes qui accèdent à l'espace** d'une société — à ne pas confondre
 * avec ses `CompanyContact`, qui sont un carnet d'adresses.
 *
 * Un contact est quelqu'un qu'on appelle ; un membre est quelqu'un qui se
 * connecte, commande, et voit les prix négociés. Les deux listes se recoupent
 * souvent sans jamais se confondre : donner un accès est une décision, pas la
 * conséquence d'avoir noté un numéro de téléphone.
 */

/**
 * Ce qu'une personne peut faire **dans cette société-là**.
 *
 * - `company_admin` — administre l'espace : membres, adresses, identité ;
 * - `member` — commande, et rien d'autre.
 *
 * Le rôle appartient au rattachement, pas à la personne : on peut administrer
 * une société et n'être que membre d'une autre.
 */
export const companyMemberRoleSchema = z.enum(["company_admin", "member"]);

export type CompanyMemberRole = z.infer<typeof companyMemberRoleSchema>;

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
  readonly mailSent: boolean;
}
