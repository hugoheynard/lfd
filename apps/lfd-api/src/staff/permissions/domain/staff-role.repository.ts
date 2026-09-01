import type { StaffRoleDefinition } from "./staff-role-definition.js";

/**
 * Port d'**écriture** des rôles définis.
 *
 * `load` + `save`, et rien d'autre : les règles du rôle (clé immuable, refus du
 * rôle vide, refus d'archiver un rôle porté) vivent dans l'agrégat. Une écriture
 * ciblée du genre `setGrants(key, grants)` les contournerait en silence — la
 * règle vivrait dans l'appelant, donc nulle part pour le suivant.
 */
export abstract class StaffRoleRepository {
  /** Le rôle par sa clé, ou `null`. Les droits sont revalidés à la relecture. */
  abstract load(key: string): Promise<StaffRoleDefinition | null>;

  /** Écrit le rôle entier, tel que `toPersistence()` le rend. */
  abstract save(role: StaffRoleDefinition): Promise<void>;

  /**
   * Combien de personnes portent ce rôle. Ici plutôt que dans l'annuaire :
   * l'agrégat en a besoin pour refuser un archivage, et dépendre de tout le
   * contexte `directory` pour un `count` coûterait un couplage entier (ISP).
   */
  abstract memberCount(key: string): Promise<number>;
}
