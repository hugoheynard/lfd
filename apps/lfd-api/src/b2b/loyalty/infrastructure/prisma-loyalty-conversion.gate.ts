import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { openingMembership } from "../../shared/membership-opening/opening-membership.js";
import { LoyaltyConversionGate } from "../domain/ports/loyalty-conversion.gate.js";
import type { LoyaltyHolder } from "../domain/value-objects/loyalty-holder.js";

/** Le seul statut d'une personne qui agit (`UserStatus`). */
const ACTIVE = "active";

/**
 * Qui peut convertir, lu dans les comptes (plan D1).
 *
 * - **une personne** : elle-même, active. La personne qui agit vient d'un
 *   principal, donc d'un compte connecté ; un invité n'en a pas.
 * - **une société** : toute personne active qui y est rattachée, quel que soit
 *   son rôle — le droit de commander n'a pas de rôle
 *   (`b2b/orders/domain/services/order-access.ts`, vérifié le 2026-09-26).
 */
@Injectable()
export class PrismaLoyaltyConversionGate extends LoyaltyConversionGate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async mayConvert(holder: LoyaltyHolder, actorUserId: string): Promise<boolean> {
    if (holder.kind === "user") {
      if (holder.id !== actorUserId) {
        return false;
      }
      const user = await this.prisma.user.findUnique({
        where: { id: actorUserId },
        select: { status: true },
      });
      return user?.status === ACTIVE;
    }
    const membership = await this.prisma.membership.findFirst({
      // Seul un rattachement qui OUVRE compte (§8.1 bis, 2026-10-10).
      where: {
        userId: actorUserId,
        companyId: holder.id,
        ...openingMembership(this.clock.now()),
      },
      select: { user: { select: { status: true } } },
    });
    return membership?.user.status === ACTIVE;
  }
}
