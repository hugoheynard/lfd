/**
 * L'état de l'accès du **détenteur** d'un compte client, vu depuis la page
 * « Accès clients » du back-office.
 *
 * Plus fin que `ContactAccess` (la fiche), sur deux points :
 * - `no_holder` : la société n'a pas de détenteur (ouverte sur sa seule
 *   enseigne). Ce n'est pas un état de personne, c'est l'absence de personne,
 *   et c'est la première chose que la page doit montrer.
 * - `disabled` : la fiche le lit `none` (« peut-elle entrer ? non »). Ici la
 *   question est « où en est-on avec ce client ? », et un accès coupé ne se
 *   rattrape pas comme un accès jamais ouvert.
 */
export type CustomerAccessState =
  "no_holder" | "none" | "invited" | "expired" | "active" | "disabled";

/** Le détenteur d'un compte, tel que la page le nomme et le relance. */
export interface CustomerAccessHolderView {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  /** Repris tel quel dans la relance : l'invitation réécrit le profil. */
  readonly phone: string;
}

/** Une société, son détenteur et l'état de son accès — une ligne de la table. */
export interface CustomerAccessRowView {
  readonly companyId: string;
  /** Le nom d'usage : l'enseigne, sinon la raison sociale. */
  readonly companyName: string;
  /** `null` pour un compte principal ; renseigné pour un sous-compte. */
  readonly parent: { readonly companyId: string; readonly companyName: string } | null;
  /** `null` = aucun détenteur ; l'état vaut alors `no_holder`. */
  readonly holder: CustomerAccessHolderView | null;
  /**
   * Renseigné quand le détenteur montré est celui du PRINCIPAL : le
   * sous-compte suit ses contacts (aspect `contacts` en cours), ou n'a pas de
   * contact propre. `holder`, `state`, `activatedAt` et `lastInvitedAt` sont
   * alors ceux de cette personne sur les rattachements du principal — et c'est
   * depuis la ligne du principal qu'on la relance. `null` sinon.
   */
  readonly holderInheritedFrom: {
    readonly companyId: string;
    readonly companyName: string;
  } | null;
  readonly state: CustomerAccessState;
  /**
   * La première connexion du détenteur (`users.first_login_at`), ISO. `null`
   * s'il n'est jamais entré — ou s'il est entré avant le 2026-10-22, date à
   * laquelle on a commencé à la retenir : l'écran dit alors « date inconnue ».
   */
  readonly activatedAt: string | null;
  /**
   * Quand l'invitation à cette société a été émise ou renouvelée pour la
   * dernière fois, ISO. ⚠️ Ce n'est pas la preuve d'un e-mail parti : un lien
   * remis à la main la renouvelle aussi, et un envoi refusé par le mailer
   * l'a posée quand même. `null` sans rattachement.
   */
  readonly lastInvitedAt: string | null;
  /** Les autres personnes rattachées à la société (détenteur exclu). */
  readonly otherMembers: number;
  /** Parmi elles, celles qui sont entrées et dont l'accès est actif. */
  readonly otherMembersActive: number;
}
