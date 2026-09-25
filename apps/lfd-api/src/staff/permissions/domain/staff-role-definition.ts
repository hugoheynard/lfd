import {
  hasStaffPermission,
  isSuperAdminRoleKey,
  resolveRolePermissions,
  toRoleGrants,
  type RoleGrant,
  type StaffPermission,
} from "@lfd/contracts";

import {
  InvalidStaffRoleError,
  ReservedStaffRoleKeyError,
  StaffRoleLastDirectoryKeeperError,
  StaffRoleSelfRevokeError,
  StaffRoleStillHeldError,
} from "./staff-role-errors.js";

/** Une personne qui tient l'annuaire (`staff_access:write`) par son rôle. */
export interface DirectoryKeeper {
  readonly staffUserId: string;
  readonly roleKey: string | null;
}

/**
 * Ce qu'une redéfinition doit savoir pour ne pas vider l'annuaire : qui la
 * demande, et qui le tient aujourd'hui — personnes non suspendues, fiche de
 * secours exclue (plan `plan-roles-lus-en-base.md` §3.3).
 */
export interface DirectoryKeepersSnapshot {
  readonly actorId: string;
  readonly keepers: readonly DirectoryKeeper[];
}

const DIRECTORY_WRITE = "staff_access:write";

/** L'état complet, tel qu'il vit en base. Aucun type Prisma ici. */
export interface StaffRoleSnapshot {
  readonly key: string;
  readonly label: string;
  readonly grants: readonly RoleGrant[];
  readonly archivedAt: Date | null;
}

/**
 * Un **rôle défini** : un paquet de droits nommé, éditable à l'écran.
 *
 * Trois règles vivent ici plutôt que dans un handler, parce qu'elles doivent
 * tenir quel que soit le chemin d'appel :
 *
 * - **la clé ne se renomme pas** — elle est écrite sur les fiches des personnes
 *   et dans le journal ; il n'y a pas de mutateur, donc rien à contourner ;
 * - **`superadmin` est réservé** — cf. {@link ReservedStaffRoleKeyError} ;
 * - **un rôle vide est refusé** — quelqu'un à qui on l'attribue verrait 403
 *   partout sans qu'aucun écran ne lui dise pourquoi. Retirer un accès se fait
 *   en suspendant la personne, pas en lui donnant un rôle creux.
 *
 * Ce que l'agrégat **ne refuse pas**, et il faut le dire : un rôle défini peut
 * porter `staff:write`. C'est nécessaire — « Administrateur » est désormais une
 * ligne comme une autre — et ça n'ouvre rien de neuf : qui tient `staff:write`
 * pouvait déjà se donner `admin`. Le sommet inatteignable, lui, reste
 * `superadmin`, hors de portée de tout écran.
 */
export class StaffRoleDefinition {
  private constructor(
    readonly key: string,
    private labelValue: string,
    private grantsValue: readonly RoleGrant[],
    private archivedAtValue: Date | null,
  ) {}

  /** Définit un rôle neuf. */
  static define(input: {
    readonly key: string;
    readonly label: string;
    readonly grants: readonly RoleGrant[];
  }): StaffRoleDefinition {
    const key = input.key.trim().toLowerCase();
    if (isSuperAdminRoleKey(key)) {
      throw new ReservedStaffRoleKeyError(key);
    }
    if (key === "") {
      throw new InvalidStaffRoleError("Clé", "obligatoire");
    }
    return new StaffRoleDefinition(
      key,
      requireLabel(input.label),
      requireGrants(input.grants),
      null,
    );
  }

  /** Reconstruit un rôle depuis sa ligne en base. */
  static reconstitute(snapshot: StaffRoleSnapshot): StaffRoleDefinition {
    return new StaffRoleDefinition(
      snapshot.key,
      snapshot.label,
      snapshot.grants,
      snapshot.archivedAt,
    );
  }

  get label(): string {
    return this.labelValue;
  }

  get archived(): boolean {
    return this.archivedAtValue !== null;
  }

  /**
   * Le libellé et les droits changent ; la clé, jamais.
   *
   * 🔴 Depuis que les rôles se lisent en base, une redéfinition **prend effet**
   * sur ses porteurs. Retirer `staff_access:write` à ce rôle est donc refusé
   * quand ça le retirerait à l'auteur lui-même, ou au dernier groupe de
   * personnes qui le tiennent (§3.3).
   *
   * @throws {StaffRoleSelfRevokeError} l'auteur tient l'annuaire par ce rôle.
   * @throws {StaffRoleLastDirectoryKeeperError} seuls ses porteurs le tiennent.
   */
  redefine(
    input: { readonly label: string; readonly grants: readonly RoleGrant[] },
    directory: DirectoryKeepersSnapshot,
  ): void {
    const label = requireLabel(input.label);
    const grants = requireGrants(input.grants);
    if (this.opensDirectory(this.grantsValue) && !this.opensDirectory(grants)) {
      this.assertDirectoryStillKept(directory);
    }
    this.labelValue = label;
    this.grantsValue = grants;
  }

  /**
   * Retire le rôle de la circulation, sans effacer ce qu'il a été.
   *
   * @throws {StaffRoleStillHeldError} des personnes le portent encore.
   */
  archive(at: Date, memberCount: number): void {
    if (memberCount > 0) {
      throw new StaffRoleStillHeldError(this.key, memberCount);
    }
    this.archivedAtValue = at;
  }

  restore(): void {
    this.archivedAtValue = null;
  }

  private opensDirectory(grants: readonly RoleGrant[]): boolean {
    return hasStaffPermission(
      resolveRolePermissions(this.key, toRoleGrants(grants)),
      DIRECTORY_WRITE,
    );
  }

  private assertDirectoryStillKept(directory: DirectoryKeepersSnapshot): void {
    const mine = directory.keepers.filter((keeper) => keeper.roleKey === this.key);
    if (mine.some((keeper) => keeper.staffUserId === directory.actorId)) {
      throw new StaffRoleSelfRevokeError(this.key);
    }
    if (mine.length > 0 && mine.length === directory.keepers.length) {
      throw new StaffRoleLastDirectoryKeeperError(this.key);
    }
  }

  /** Ce que ce rôle accorde, résolu exactement comme un guard le vérifiera. */
  permissions(): readonly StaffPermission[] {
    return resolveRolePermissions(this.key, toRoleGrants(this.grantsValue));
  }

  toPersistence(): StaffRoleSnapshot {
    return {
      key: this.key,
      label: this.labelValue,
      grants: this.grantsValue,
      archivedAt: this.archivedAtValue,
    };
  }
}

function requireLabel(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") {
    throw new InvalidStaffRoleError("Libellé", "obligatoire");
  }
  return trimmed;
}

/**
 * Les droits, dédupliqués par la forme et non par un contrôle : deux lignes sur
 * la même ressource seraient une question sans réponse.
 */
function requireGrants(grants: readonly RoleGrant[]): readonly RoleGrant[] {
  if (grants.length === 0) {
    throw new InvalidStaffRoleError(
      "Droits",
      "un rôle qui n'ouvre aucun écran n'est pas un rôle — pour retirer un accès, " +
        "suspendez la personne",
    );
  }
  const resources = new Set(grants.map((grant) => grant.resource));
  if (resources.size !== grants.length) {
    throw new InvalidStaffRoleError("Droits", "une ressource ne peut porter qu'un seul niveau");
  }
  return grants;
}
