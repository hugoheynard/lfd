import type { DirectoryKeeper, StaffRoleDefinition } from "./staff-role-definition.js";

/**
 * `forUpdate` : verrouille la ligne jusqu'au commit (`SELECT … FOR UPDATE`).
 * Ne vaut que dans une unité de travail — hors transaction, le verrou tombe à
 * la fin de la lecture.
 */
export interface StaffRoleLoadOptions {
  readonly forUpdate: boolean;
}

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
  abstract load(key: string, options?: StaffRoleLoadOptions): Promise<StaffRoleDefinition | null>;

  /** Écrit le rôle entier, tel que `toPersistence()` le rend. */
  abstract save(role: StaffRoleDefinition): Promise<void>;

  /**
   * Combien de personnes portent ce rôle. Ici plutôt que dans l'annuaire :
   * l'agrégat en a besoin pour refuser un archivage, et dépendre de tout le
   * contexte `directory` pour un `count` coûterait un couplage entier (ISP).
   */
  abstract memberCount(key: string): Promise<number>;

  /**
   * Qui tient l'annuaire (`staff_access:write`) par son rôle aujourd'hui :
   * personnes non suspendues, fiche de secours exclue. L'agrégat en a besoin
   * pour refuser une redéfinition qui le viderait (plan
   * `plan-roles-lus-en-base.md` §3.3) — même raison d'être ici que
   * {@link memberCount}.
   */
  abstract directoryKeepers(): Promise<readonly DirectoryKeeper[]>;
}
