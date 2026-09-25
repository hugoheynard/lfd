import {
  ALL_STAFF_PERMISSIONS,
  resolveRolePermissions,
  roleGrantsSchema,
  toRoleGrants,
  SUPER_ADMIN_ROLE_KEY,
  SUPER_ADMIN_ROLE_LABEL,
  type RoleGrant,
  type StaffRoleView,
} from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { StaffRoleDefinition, type DirectoryKeeper } from "../domain/staff-role-definition.js";
import { StaffRoleReader } from "../domain/staff-role.reader.js";
import { StaffRoleRepository, type StaffRoleLoadOptions } from "../domain/staff-role.repository.js";
import { directoryKeepers } from "./role-assignment.js";

/** Adaptateur Prisma du dépôt de rôles. */
@Injectable()
export class PrismaStaffRoleRepository extends StaffRoleRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async load(key: string, options?: StaffRoleLoadOptions): Promise<StaffRoleDefinition | null> {
    if (options?.forUpdate === true) {
      // Le verrou d'abord, la lecture typée ensuite : Prisma n'exprime pas
      // `FOR UPDATE`. Une attribution concurrente (`FOR SHARE`) attend ici,
      // ou nous fait attendre — jamais un rôle archivé porté (§3.3).
      await this.prisma.$queryRaw`
        SELECT 1 FROM "public"."staff_role_definitions" WHERE "key" = ${key} FOR UPDATE`;
    }
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

  memberCount(key: string): Promise<number> {
    // Sur `role_key`, plus sur l'enum : l'enum rendait 0 pour un rôle créé à
    // l'écran, qui s'archivait alors en retirant à ses porteurs tous leurs
    // droits, en silence (plan `plan-roles-lus-en-base.md` §3.3).
    return this.prisma.staffUser.count({ where: { roleKey: key } });
  }

  directoryKeepers(): Promise<readonly DirectoryKeeper[]> {
    return directoryKeepers(this.prisma, this.config.bootstrapAdminEmail());
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
      this.prisma.staffUser.groupBy({ by: ["roleKey"], _count: { _all: true } }),
    ]);
    const membersByKey = new Map(
      counts.flatMap((entry) =>
        entry.roleKey === null ? [] : [[entry.roleKey, entry._count._all] as const],
      ),
    );

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
