import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { SalesContextKeysReader } from "../domain/ports/sales-context-keys.reader.js";

/** Un `findMany` de deux colonnes sur le registre — quelques lignes. */
@Injectable()
export class PrismaSalesContextKeysReader extends SalesContextKeysReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async keysById(): Promise<ReadonlyMap<string, string>> {
    const rows = await this.prisma.salesContext.findMany({ select: { id: true, key: true } });
    return new Map(rows.map((row) => [row.id, row.key]));
  }
}
