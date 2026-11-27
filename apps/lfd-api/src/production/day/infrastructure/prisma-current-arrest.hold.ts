import { Injectable } from "@nestjs/common";

import { CurrentArrestHold } from "../../channels/commerce/current-arrest.hold.js";
import { PrismaArrestedPlanHold } from "./prisma-arrested-plan.hold.js";

/**
 * Le même verrou partagé que `PrismaArrestedPlanHold`, puis l'égalité de
 * `closed_at` avec l'arrêt annoncé : une journée rouverte (`closed_at` nul) ou
 * réarrêtée à un autre instant n'est plus celle de cet arrêt.
 */
@Injectable()
export class PrismaCurrentArrestHold extends CurrentArrestHold {
  constructor(private readonly plans: PrismaArrestedPlanHold) {
    super();
  }

  async holdIfCurrent(serviceDay: string, closedAt: Date): Promise<boolean> {
    const header = await this.plans.heldHeader(serviceDay);
    return header?.closedAt?.getTime() === closedAt.getTime();
  }
}
