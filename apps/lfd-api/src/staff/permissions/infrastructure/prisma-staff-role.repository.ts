import {
  ALL_STAFF_PERMISSIONS,
  resolveRolePermissions,
  roleGrantsSchema,
  staffRoleSchema,
  toRoleGrants,
  SUPER_ADMIN_ROLE_KEY,
  SUPER_ADMIN_ROLE_LABEL,
  type RoleGrant,
  type StaffRoleView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { StaffRoleDefinition } from "../domain/staff-role-definition.js";
import { StaffRoleReader } from "../domain/staff-role.reader.js";
import { StaffRoleRepository } from "../domain/staff-role.repository.js";

/** Adaptateur Prisma du dépôt de rôles. */
@Injectable()
export class PrismaStaffRoleRepository extends StaffRoleRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(key: string): Promise<StaffRoleDefinition | null> {
    const row = await this.prisma.staffRoleDefinition.findUnique({ where: { key } });
    return row === null
      ? null
      : StaffRoleDefinition.reconstitute({
          key: row.key,
          label: row.label,
          grants: parseGrants(row.grants),
          archivedAt: row.archivedAt,
        });
  }

  async save(role: StaffRoleDefinition): Promise<void> {
    const snapshot = role.toPersistence();
    const writable = {
      label: snapshot.label,
      // Le tableau part en `jsonb` tel quel : c'est la forme du contrat, et
      // `parseGrants` le revalide à la relecture.
      grants: [...snapshot.grants],
      archivedAt: snapshot.archivedAt,
    };
    await this.prisma.staffRoleDefinition.upsert({
      where: { key: snapshot.key },
      create: { key: snapshot.key, ...writable },
      update: writable,
    });
  }

  async memberCount(key: string): Promise<number> {
    // `staff_users.role` est encore l'enum du catalogue : une clé qui n'en fait
    // pas partie n'est portée par personne, et l'interroger ferait échouer
    // Prisma sur une valeur d'enum inconnue au lieu de rendre zéro.
    const asBuiltIn = staffRoleSchema.safeParse(key);
    if (!asBuiltIn.success) {
      return 0;
    }
    return this.prisma.staffUser.count({ where: { role: asBuiltIn.data } });
  }
}

/** Adaptateur Prisma du port de lecture. */
@Injectable()
export class PrismaStaffRoleReader extends StaffRoleReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(): Promise<readonly StaffRoleView[]> {
    const [rows, counts] = await Promise.all([
      this.prisma.staffRoleDefinition.findMany({ orderBy: { key: "asc" } }),
      this.prisma.staffUser.groupBy({ by: ["role"], _count: { _all: true } }),
    ]);
    const membersByKey = new Map(counts.map((entry) => [String(entry.role), entry._count._all]));

    const defined = rows.map((row): StaffRoleView => {
      const grants = parseGrants(row.grants);
      return {
        key: row.key,
        label: row.label,
        locked: false,
        grants,
        permissions: resolveRolePermissions(row.key, toRoleGrants(grants)),
        memberCount: membersByKey.get(row.key) ?? 0,
        archivedAt: row.archivedAt?.toISOString() ?? null,
      };
    });

    return [superAdminView(membersByKey.get(SUPER_ADMIN_ROLE_KEY) ?? 0), ...defined];
  }
}

/**
 * `superadmin` n'a pas de ligne : il est **fabriqué** à la lecture, avec toutes
 * les permissions et aucun droit énuméré. C'est la traduction fidèle du
 * court-circuit du contrat — lui inventer une matrice de droits ici ferait
 * croire à l'écran qu'elle se modifie.
 */
function superAdminView(memberCount: number): StaffRoleView {
  return {
    key: SUPER_ADMIN_ROLE_KEY,
    label: SUPER_ADMIN_ROLE_LABEL,
    locked: true,
    grants: [],
    permissions: ALL_STAFF_PERMISSIONS,
    memberCount,
    archivedAt: null,
  };
}

/**
 * Le `jsonb` redevient des droits typés, et **revalidés**. Une colonne JSON n'a
 * pas de schéma : sans cette relecture, une ligne écrite à la main ou par une
 * version antérieure du contrat traverserait jusqu'à la résolution d'accès.
 */
function parseGrants(raw: unknown): readonly RoleGrant[] {
  return roleGrantsSchema.parse(raw);
}
