import { Injectable } from "@nestjs/common";
import type { PriceTemplateKind } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  PriceTemplatesReader,
  type StoredPriceTemplate,
} from "../application/ports/price-templates.reader.js";
import { templateStateFromRow, type TemplateRow } from "./price-template-rows.js";

/** Les gabarits, lus en base et convertis par le seul convertisseur du contexte. */
@Injectable()
export class PrismaPriceTemplatesReader extends PriceTemplatesReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async list(kind: PriceTemplateKind): Promise<readonly StoredPriceTemplate[]> {
    const rows = await this.prisma.priceTemplate.findMany({
      where: { kind, archivedAt: null },
      orderBy: { updatedAt: "desc" },
    });
    return rows.map(stored);
  }

  async byId(id: string): Promise<StoredPriceTemplate | null> {
    const row = await this.prisma.priceTemplate.findUnique({ where: { id } });
    return row === null ? null : stored(row);
  }
}

function stored(row: TemplateRow & { createdAt: Date; updatedAt: Date }): StoredPriceTemplate {
  return { state: templateStateFromRow(row), createdAt: row.createdAt, updatedAt: row.updatedAt };
}
