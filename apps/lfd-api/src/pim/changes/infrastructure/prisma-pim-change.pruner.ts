import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../infra/database/pim-prisma.service.js";
import { PimChangePruner } from "../domain/ports/pim-change.pruner.js";

/**
 * Le balayage de `pim.pim_change`. Une suppression PHYSIQUE, et c'est permis :
 * ce journal n'est pas un agrégat métier, c'est un numéro d'affichage.
 */
@Injectable()
export class PrismaPimChangePruner extends PimChangePruner {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async pruneBefore(instant: Date): Promise<number> {
    const { count } = await this.prisma.pimChange.deleteMany({
      where: { changedAt: { lt: instant } },
    });
    return count;
  }
}
