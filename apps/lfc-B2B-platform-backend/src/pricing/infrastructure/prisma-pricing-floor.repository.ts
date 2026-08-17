import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { PricingFloorRepository } from "../domain/ports/pricing-floor.repository.js";
import type { PricingFloor } from "../domain/entities/pricing-floor.js";
import type { PriceFloor } from "../domain/price-rule.js";

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
    const dynamic = state.policy.dynamic;
    const shared = {
      scopeType: state.scope.type,
      scopeId: state.scope.id,
      mode: state.policy.hard.mode,
      value: magnitudeOf(state.policy.hard),
      // Toutes les colonnes de la porte sont écrites, y compris à `null` : un
      // `upsert` qui les omettrait laisserait la porte d'une version précédente
      // en place, et le plancher dur deviendrait contournable sans que personne
      // ne l'ait décidé.
      dynamicMode: dynamic?.floor.mode ?? null,
      dynamicValue: dynamic === null ? null : magnitudeOf(dynamic.floor),
      unlockMinQuantity: dynamic?.unlock.minQuantity ?? null,
      unlockMinVolumeRatioBp: dynamic?.unlock.minVolumeRatioBp ?? null,
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

function magnitudeOf(floor: PriceFloor): number {
  return floor.mode === "percent" ? floor.bp : floor.cents;
}
