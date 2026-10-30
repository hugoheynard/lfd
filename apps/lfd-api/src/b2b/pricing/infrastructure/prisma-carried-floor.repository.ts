import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { PricingFloor } from "../domain/entities/pricing-floor.js";
import type { PriceFloor } from "../domain/price-rule.js";
import type { PricingAct } from "../domain/pricing-act.js";
import {
  CarriedFloorRepository,
  type StoredFloor,
} from "../domain/ports/carried-floor.repository.js";
import { originColumn } from "./decision-origin-rows.js";
import { PricingActWriter } from "./pricing-act.writer.js";
import { pricingFloorFromRow } from "./pricing-floor-rows.js";

/**
 * Le report d'un plancher (`plan-report-apres-detachement.md`, § 2.3) :
 * relire une version par son identifiant, et INSÉRER — jamais la clôture de
 * la limite en vigueur que fait `PrismaPricingFloorRepository.pose`. Une
 * course perdue retombe sur `price_floors_no_overlap_by_clientele`.
 */
@Injectable()
export class PrismaCarriedFloorRepository extends CarriedFloorRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly acts: PricingActWriter,
  ) {
    super();
  }

  async load(id: string): Promise<StoredFloor | null> {
    const row = await this.prisma.priceFloor.findUnique({ where: { id } });
    return row === null ? null : { floor: pricingFloorFromRow(row), archivedAt: row.archivedAt };
  }

  async carry(floor: PricingFloor, act: PricingAct): Promise<void> {
    const state = floor.toPersistence();
    const dynamic = state.policy.dynamic;
    await this.acts.around(act, () =>
      this.prisma.priceFloor.create({
        data: {
          id: state.id,
          scopeType: state.scope.type,
          scopeId: state.scope.id,
          clientele: state.clientele,
          mode: state.policy.hard.mode,
          value: magnitudeOf(state.policy.hard),
          dynamicMode: dynamic?.floor.mode ?? null,
          dynamicValue: dynamic === null ? null : magnitudeOf(dynamic.floor),
          unlockMinQuantity: dynamic?.unlock.minQuantity ?? null,
          unlockMinVolumeRatioBp: dynamic?.unlock.minVolumeRatioBp ?? null,
          referenceCanonicalMillicents: state.referenceCanonicalMillicents,
          createdBy: state.createdBy,
          validFrom: state.validFrom,
          validTo: state.validTo,
          ...originColumn(floor.origin),
        },
      }),
    );
  }
}

function magnitudeOf(floor: PriceFloor): number {
  return floor.mode === "percent" ? floor.bp : floor.millicents;
}
