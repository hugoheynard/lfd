import type {
  StaffMeView,
  StaffStatus,
  StaffStatusChange,
  StaffUserPayload,
  StaffUserView,
} from "@lfd/contracts";

import type { StaffUserCreated, StaffUserEdit, StaffUserSnapshot } from "./staff-user-state.js";

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
   * Ajoute un user. `actorId` — l'id de la **fiche** de l'auteur, jamais son
   * `sub` — attribue ses éventuelles dérogations à leur auteur.
   *
   * Le rôle est une **clé**, confrontée aux définitions actives sous verrou
   * partagé (plan `plan-roles-lus-en-base.md` §3.3, §3.5) : à appeler dans une
   * unité de travail. Rend l'id et le libellé du rôle, que le journal fige.
   *
   * @throws {DuplicateStaffEmailError} l'e-mail est déjà pris.
   * @throws {StaffRoleNotAssignableError} le rôle n'est pas défini, ou archivé.
   */
  abstract create(payload: StaffUserPayload, actorId: string): Promise<StaffUserCreated>;

  /**
   * Remplace l'identité et le rôle d'un user, et **applique le diff** de ses
   * dérogations : les retirées sont supprimées, les nouvelles créées, celles
   * dont l'effet change mises à jour — auteur et date du jour pour ces deux
   * dernières —, les autres **ne sont pas touchées**. Une édition sans aucun
   * changement n'écrit rien.
   *
   * `actorId` (id de fiche de l'auteur) sert deux fois : il attribue les
   * dérogations, et il permet de reconnaître que l'auteur se vise **lui-même**
   * (garde-fou d'auto-rétrogradation).
   *
   * Rend l'état d'avant, l'état écrit et le diff des écarts : c'est la matière
   * des faits du journal. N'oublie PAS le cache d'accès — c'est à l'appelant de
   * le faire, **après** le commit (plan `plan-journal-de-l-annuaire.md` §5).
   *
   * @throws {StaffUserNotFoundError} l'`id` n'existe pas.
   * @throws {DuplicateStaffEmailError} l'e-mail est pris par un autre user.
   * @throws {ProtectedStaffUserError} la cible est la fiche racine, renommée ou changée de rôle.
   * @throws {StaffRoleNotAssignableError} le rôle visé n'est pas défini, ou archivé.
   * @throws {SelfDemotionError} l'auteur se retire `staff_access:write`.
   * @throws {LastStaffAdminError} plus personne ne tiendrait l'annuaire par son rôle.
   * @throws {AdminOverrideRefusedError} un écart fermerait l'annuaire que le rôle ouvre.
   */
  abstract update(id: string, payload: StaffUserPayload, actorId: string): Promise<StaffUserEdit>;

  /**
   * Suspend une personne, ou la réintègre. Suspendre **ferme tout, tout de
   * suite, sans rien détruire** : c'est le geste du départ, et on ne supprime
   * pas quelqu'un dont le nom est attaché à des décisions datées ailleurs.
   *
   * Rend l'état d'AVANT : un fait ne s'écrit que si le statut a bougé. Le
   * cache d'accès est à vider par l'appelant, après le commit.
   *
   * @throws {StaffUserNotFoundError} l'`id` n'existe pas.
   * @throws {ProtectedStaffUserError} la cible est l'admin racine.
   * @throws {SelfDemotionError} l'auteur se suspend lui-même alors qu'il tient l'annuaire.
   * @throws {LastStaffAdminError} suspendre laisserait l'annuaire sans personne pour le tenir.
   */
  abstract setStatus(
    id: string,
    change: StaffStatusChange,
    actorId: string,
  ): Promise<StaffUserSnapshot>;

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
   *
   * Le cache d'accès est à vider par l'appelant, après le commit.
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
