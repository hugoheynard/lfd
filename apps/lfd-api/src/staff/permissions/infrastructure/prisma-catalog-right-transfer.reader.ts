import { roleGrantsSchema, toRoleGrants, type RoleGrants } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CATALOG_RESOURCE,
  LEGACY_CATALOG_RESOURCE,
  type CatalogRightResource,
} from "../domain/catalog-right-resources.js";
import {
  CatalogRightTransferReader,
  type CatalogRightOverride,
  type CatalogRightRole,
} from "../domain/catalog-right-transfer.reader.js";

const CATALOG_RIGHTS: readonly CatalogRightResource[] = [LEGACY_CATALOG_RESOURCE, CATALOG_RESOURCE];

/** Adaptateur Prisma de l'aperçu du transfert du droit du catalogue. */
@Injectable()
export class PrismaCatalogRightTransferReader extends CatalogRightTransferReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async roles(): Promise<readonly CatalogRightRole[]> {
    const rows = await this.prisma.staffRoleDefinition.findMany({
      select: { key: true, label: true, grants: true, archivedAt: true },
    });
    return rows.map((row) => ({
      key: row.key,
      label: row.label,
      archived: row.archivedAt !== null,
      grants: readableGrants(row.grants),
    }));
  }

  async catalogOverrides(): Promise<readonly CatalogRightOverride[]> {
    const rows = await this.prisma.staffPermissionOverride.findMany({
      where: { resource: { in: [...CATALOG_RIGHTS] } },
      select: {
        staffUserId: true,
        resource: true,
        action: true,
        effect: true,
        staffUser: { select: { firstName: true, lastName: true } },
      },
    });
    return rows.flatMap((row) => {
      const resource = CATALOG_RIGHTS.find((candidate) => candidate === row.resource);
      return resource === undefined
        ? []
        : [
            {
              staffUserId: row.staffUserId,
              staffName: `${row.staffUser.firstName} ${row.staffUser.lastName}`.trim(),
              resource,
              action: row.action,
              effect: row.effect,
            },
          ];
    });
  }

  unreadLegacyNotifications(): Promise<number> {
    return this.prisma.staffNotification.count({
      where: { audience: { startsWith: `${LEGACY_CATALOG_RESOURCE}:` }, readAt: null },
    });
  }
}

/**
 * Relus par le schéma du contrat, comme le résolveur. Illisibles → `null`, que
 * le domaine montre comme un écart : on n'affirme rien d'un rôle qu'on ne lit
 * pas, et surtout pas qu'il est « sans écart ».
 */
function readableGrants(raw: unknown): RoleGrants | null {
  const parsed = roleGrantsSchema.safeParse(raw);
  return parsed.success ? toRoleGrants(parsed.data) : null;
}
