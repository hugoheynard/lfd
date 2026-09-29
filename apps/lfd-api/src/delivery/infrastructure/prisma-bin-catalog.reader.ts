import type { BinCapacityView, BinTypeView } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import { BinCatalogReader } from "../domain/ports/bin-catalog.reader.js";
import { binTypeViewOf } from "./delivery-bin-type.mapper.js";

/** Adaptateur Prisma de la lecture du catalogue des bacs. */
@Injectable()
export class PrismaBinCatalogReader extends BinCatalogReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listTypes(): Promise<readonly BinTypeView[]> {
    const rows = await this.prisma.deliveryBinType.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(binTypeViewOf);
  }

  async activeCapacities(): Promise<readonly BinCapacityView[]> {
    const rows = await this.prisma.deliveryBinCapacity.findMany({
      where: { binType: { archivedAt: null } },
      select: { binTypeId: true, sku: true, units: true },
      orderBy: [{ binTypeId: "asc" }, { sku: "asc" }],
    });
    return rows;
  }
}
