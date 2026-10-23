import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { Clock } from "../../../platform/time/clock.js";
import { standingRole } from "../../shared/company-standing/domain/company-standing.js";
import { readCompanyStanding } from "../../shared/company-standing/infrastructure/read-company-standing.js";
import { type AccessedOrder, OrderAccessReader } from "../domain/ports/order-access.reader.js";
import type { OrderRole } from "../domain/ports/order-guard.reader.js";

/**
 * Le rôle effectif dans la société d'une commande — la requête partagée
 * (S6, R1), dont ce lecteur était la première copie (C1, §7.2) : membership
 * propre qui ouvre, ou héritage du principal ACTUEL (acceptée, principal
 * `active`, site non suspendu).
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
    return standingRole(
      await readCompanyStanding(this.prisma, this.clock.now(), userId, order.companyId),
    );
  }
}
