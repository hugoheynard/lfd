import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { InvoicingFloorReader } from "../domain/ports/invoicing-floor.reader.js";

/** La ligne unique de `public.invoicing_floor`. */
@Injectable()
export class PrismaInvoicingFloorReader extends InvoicingFloorReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async floor(): Promise<Date | null> {
    const row = await this.prisma.invoicingFloor.findUnique({ where: { id: true } });
    return row?.floorAt ?? null;
  }
}
