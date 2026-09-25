import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CatalogOperationOverride } from "../domain/entities/catalog-operation-override.js";
import { CatalogOperationOverrideRepository } from "../domain/ports/catalog-operation-override.repository.js";
import { toOverrideState } from "./catalog-operation-rows.js";

/** La surcharge d'une opération reçue — une ligne par opération, jamais supprimée. */
@Injectable()
export class PrismaCatalogOperationOverrideRepository extends CatalogOperationOverrideRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(operationKey: string): Promise<CatalogOperationOverride | null> {
    const row = await this.prisma.catalogOperationOverride.findUnique({ where: { operationKey } });
    return row === null ? null : CatalogOperationOverride.reconstitute(toOverrideState(row));
  }

  async save(override: CatalogOperationOverride): Promise<void> {
    const state = override.toPersistence();
    const columns = {
      isHidden: state.restriction.isHidden,
      orderUntil: state.restriction.orderUntil,
      audience: state.restriction.audience,
      hiddenSkus: [...state.restriction.hiddenSkus],
      decidedBy: state.decidedBy,
      decidedAt: state.decidedAt,
    };
    await this.prisma.catalogOperationOverride.upsert({
      where: { operationKey: state.operationKey },
      create: { operationKey: state.operationKey, ...columns },
      update: columns,
    });
  }
}
