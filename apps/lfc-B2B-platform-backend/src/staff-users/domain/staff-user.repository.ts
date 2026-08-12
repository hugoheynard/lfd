import type {
  StaffMeView,
  StaffStatus,
  StaffStatusChange,
  StaffUserPayload,
  StaffUserView,
} from "@lfd/contracts";

/**
 * Port des **utilisateurs staff** (annuaire back-office). Source de vérité
 * **locale** ; le provisioning de connexion (Auth0) est différé. L'e-mail est la
 * clé humaine unique — le repository refuse un doublon.
 */
export abstract class StaffUserRepository {
  /** Tous les users staff, triés par nom puis prénom. */
  abstract list(): Promise<readonly StaffUserView[]>;

  /**
   * L'identité et l'**effectif** d'une personne — ce que `/admin/me` renvoie.
   * @throws {StaffUserNotFoundError} l'`id` n'existe pas.
   */
  abstract me(id: string): Promise<StaffMeView>;

  /**
   * Ajoute un user. `actorSub` attribue ses éventuelles dérogations à leur auteur.
   * @throws {DuplicateStaffEmailError} l'e-mail est déjà pris.
   */
  abstract create(payload: StaffUserPayload, actorSub: string): Promise<string>;

  /**
   * Remplace un user — identité, rôle et dérogations, ces dernières en bloc.
   *
   * `actorSub` sert deux fois : il attribue les dérogations, et il permet de
   * reconnaître que l'auteur se vise **lui-même** (garde-fou d'auto-rétrogradation).
   *
   * @throws {StaffUserNotFoundError} l'`id` n'existe pas.
   * @throws {DuplicateStaffEmailError} l'e-mail est pris par un autre user.
   * @throws {ProtectedStaffUserError} la cible est l'admin racine, renommé ou rétrogradé.
   * @throws {SelfDemotionError} l'auteur se retire son propre rôle `admin`.
   * @throws {LastStaffAdminError} la mutation retirerait le dernier administrateur.
   * @throws {AdminOverrideRefusedError} une dérogation priverait un admin de `staff:write`.
   */
  abstract update(id: string, payload: StaffUserPayload, actorSub: string): Promise<void>;

  /**
   * Supprime un user.
   * @throws {StaffUserNotFoundError} l'`id` n'existe pas.
   * @throws {ProtectedStaffUserError} la cible est l'admin racine (ineffaçable).
   * @throws {SelfDemotionError} l'auteur se supprime lui-même alors qu'il est admin.
   * @throws {LastStaffAdminError} la cible est le dernier administrateur.
   */
  abstract remove(id: string, actorSub: string): Promise<void>;

  /**
   * Suspend une personne, ou la réintègre. Suspendre **ferme tout, tout de
   * suite, sans rien détruire** : c'est le geste du départ, et on ne supprime
   * pas quelqu'un dont le nom est attaché à des décisions datées ailleurs.
   *
   * @throws {StaffUserNotFoundError} l'`id` n'existe pas.
   * @throws {ProtectedStaffUserError} la cible est l'admin racine.
   * @throws {SelfDemotionError} l'auteur se suspend lui-même alors qu'il est admin.
   * @throws {LastStaffAdminError} suspendre laisserait le back-office sans admin.
   */
  abstract setStatus(id: string, change: StaffStatusChange, actorSub: string): Promise<void>;

  /**
   * Garantit l'existence de l'**admin racine** (`BOOTSTRAP_ADMIN`) : le crée s'il
   * manque, no-op sinon (ne clobbe pas d'éventuelles éditions). Appelé au boot —
   * l'admin réapparaît même supprimé directement en base. Idempotent.
   */
  abstract ensureBootstrapAdmin(): Promise<void>;

  /**
   * Ce qu'une fiche dit de son **identité de connexion** — et rien d'autre.
   *
   * Deux gestes s'en servent, et c'est pourquoi elle ne s'appelle pas
   * « forInvitation » : inviter a besoin de savoir s'il faut créer ou ré-émettre,
   * et éditer a besoin de savoir si l'adresse a changé sur une identité déjà
   * liée. Un nom qui n'énonce qu'un seul de ses usagers finit par empêcher le
   * second.
   *
   * @throws {StaffUserNotFoundError} l'`id` n'existe pas.
   */
  abstract identityOf(id: string): Promise<StaffIdentityFacts>;

  /**
   * Constate l'invitation : la fiche passe `invited`, la date est posée, et
   * l'identité fraîchement ouverte est liée.
   *
   * **N'écrase pas un `active`** : ré-envoyer un lien à quelqu'un qui est déjà
   * entré ne doit pas lui retirer son accès pour le remettre en attente. Le
   * geste reste utile — il sert à qui a perdu son mot de passe — mais il ne
   * change pas l'état.
   */
  abstract markInvited(id: string, subject: string, invitedAt: Date): Promise<void>;
}

/** L'état d'une fiche du point de vue du fournisseur d'identité. */
export interface StaffIdentityFacts {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  /** `null` tant qu'aucune identité n'a été ouverte : il faudra la créer. */
  readonly auth0Id: string | null;
  readonly status: StaffStatus;
}
