import type { StaffUserPayload, StaffUserView } from "@lfd/contracts";

/**
 * Port des **utilisateurs staff** (annuaire back-office). Source de vérité
 * **locale** ; le provisioning de connexion (Auth0) est différé. L'e-mail est la
 * clé humaine unique — le repository refuse un doublon.
 */
export abstract class StaffUserRepository {
  /** Tous les users staff, triés par nom puis prénom. */
  abstract list(): Promise<readonly StaffUserView[]>;

  /**
   * Ajoute un user.
   * @throws {DuplicateStaffEmailError} l'e-mail est déjà pris.
   */
  abstract create(payload: StaffUserPayload): Promise<string>;

  /**
   * Remplace un user.
   * @throws {StaffUserNotFoundError} l'`id` n'existe pas.
   * @throws {DuplicateStaffEmailError} l'e-mail est pris par un autre user.
   */
  abstract update(id: string, payload: StaffUserPayload): Promise<void>;

  /**
   * Supprime un user.
   * @throws {StaffUserNotFoundError} l'`id` n'existe pas.
   * @throws {ProtectedStaffUserError} la cible est l'admin racine (ineffaçable).
   */
  abstract remove(id: string): Promise<void>;

  /**
   * Garantit l'existence de l'**admin racine** (`BOOTSTRAP_ADMIN`) : le crée s'il
   * manque, no-op sinon (ne clobbe pas d'éventuelles éditions). Appelé au boot —
   * l'admin réapparaît même supprimé directement en base. Idempotent.
   */
  abstract ensureBootstrapAdmin(): Promise<void>;
}
