import type { StaffPermission } from "@lfd/contracts";
import { Injectable, Logger } from "@nestjs/common";

import { AppConfig } from "../../../platform/config/app-config.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  HELD_ROLE_SELECT,
  isRescueFiche,
  resolveHeldRole,
} from "../../permissions/infrastructure/held-role.js";
import {
  StaffPermissionHolders,
  type StaffPermissionHolder,
} from "../domain/staff-permission-holders.js";

const HOLDER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  ...HELD_ROLE_SELECT,
  overrides: { select: { resource: true, action: true, effect: true } },
} as const;

/**
 * Adaptateur de {@link StaffPermissionHolders} : UNE lecture de l'annuaire, puis
 * la résolution de `resolveHeldRole` — celle du guard, de `/admin/me` et de la
 * liste de l'équipe. Une seconde implémentation de la règle divergerait, et
 * proposerait des livreurs que le guard refuse.
 *
 * L'annuaire tient quelques dizaines de fiches : les relire toutes est moins
 * cher que de réécrire la résolution en SQL.
 */
@Injectable()
export class PrismaStaffPermissionHolders extends StaffPermissionHolders {
  private readonly logger = new Logger(PrismaStaffPermissionHolders.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async holdersOf(permission: StaffPermission): Promise<readonly StaffPermissionHolder[]> {
    const rows = await this.prisma.staffUser.findMany({
      where: { status: { not: "suspended" } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { id: "asc" }],
      select: HOLDER_SELECT,
    });
    const rescueEmail = this.config.bootstrapAdminEmail();
    return rows
      .filter((row) => {
        const role = resolveHeldRole(
          row,
          row.overrides.map((entry) => ({ ...entry })),
          isRescueFiche(row.email, rescueEmail),
          (key, error) => this.reportUnreadableRole(key, error),
        );
        return role.permissions.includes(permission);
      })
      .map((row) => ({ staffUserId: row.id, firstName: row.firstName, lastName: row.lastName }));
  }

  /** Une définition illisible : ses porteurs ne tiennent que leurs écarts — on le dit au log. */
  private reportUnreadableRole(roleKey: string, error: unknown): void {
    this.logger.error(
      `Droits illisibles pour le rôle « ${roleKey} » : ses porteurs n'ont plus que leurs ` +
        `écarts individuels. Corriger la définition dans Admin › Rôles.`,
      error,
    );
  }
}
