import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { PricingFloorRepository } from "../domain/ports/pricing-floor.repository.js";
import type { PricingFloor } from "../domain/entities/pricing-floor.js";

@Injectable()
export class PrismaPricingFloorRepository extends PricingFloorRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Un `upsert` sur la **clé primaire**, et c'est possible uniquement parce que
   * l'identifiant est dérivé de la portée : pas de lecture préalable, donc pas de
   * fenêtre entre « je regarde s'il existe » et « je l'écris ».
   */
  async pose(floor: PricingFloor): Promise<void> {
    const state = floor.toPersistence();
    const value = state.floor.mode === "percent" ? state.floor.bp : state.floor.cents;
    const shared = {
      scopeType: state.scope.type,
      scopeId: state.scope.id,
      mode: state.floor.mode,
      value,
      createdBy: state.createdBy,
    };

    await this.prisma.priceFloor.upsert({
      where: { id: state.id },
      create: { id: state.id, ...shared },
      update: shared,
    });
  }

  async remove(id: string): Promise<boolean> {
    const { count } = await this.prisma.priceFloor.deleteMany({ where: { id } });
    return count > 0;
  }
}
