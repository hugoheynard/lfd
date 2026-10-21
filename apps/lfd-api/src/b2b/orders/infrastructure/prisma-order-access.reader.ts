import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { effectiveRole } from "../../account/domain/services/effective-role.js";
import { openingMembership } from "../../shared/membership-opening/opening-membership.js";
import { type AccessedOrder, OrderAccessReader } from "../domain/ports/order-access.reader.js";
import type { OrderRole } from "../domain/ports/order-guard.reader.js";

/**
 * Le rôle effectif dans la société d'une commande, en UNE lecture : la
 * membership propre (celle qui ouvre, `openingMembership`, comme `roleOf`) et
 * celle du principal ACTUEL — acceptée, principal `active` (§7.2 du plan
 * `plan-commandes-des-sites.md`). Une invitation non acceptée au principal
 * n'ouvre rien sur ses sites.
 */
@Injectable()
export class PrismaOrderAccessReader extends OrderAccessReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async accessToOrder(userId: string, order: AccessedOrder): Promise<OrderRole | null> {
    if (order.companyId === null) {
      return null;
    }
    const company = await this.prisma.company.findUnique({
      where: { id: order.companyId },
      select: {
        memberships: {
          where: { userId, ...openingMembership(this.clock.now()) },
          select: { role: true },
        },
        parentCompany: {
          select: {
            status: true,
            memberships: {
              where: { userId, acceptedAt: { not: null } },
              select: { role: true },
            },
          },
        },
      },
    });
    if (company === null) {
      return null;
    }
    const parent = company.parentCompany;
    const roleInParent =
      parent !== null && parent.status === "active" ? (parent.memberships[0]?.role ?? null) : null;
    return effectiveRole(company.memberships[0]?.role ?? null, roleInParent);
  }
}
