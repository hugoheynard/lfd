import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { DetachmentOriginReader } from "../domain/ports/detachment-origin.reader.js";
import { STILL_SOLD } from "./sellable-filter.js";

/**
 * La filiation d'un article en vente, lue sur sa ligne du miroir. Toute
 * déclinaison se vend sous sa référence (`shopSkuOf`) : la clé est le `sku`.
 */
@Injectable()
export class PrismaDetachmentOriginReader extends DetachmentOriginReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async detachedFromOf(shopSku: string): Promise<string | null> {
    const row = await this.prisma.catalogItem.findFirst({
      where: { sku: shopSku, ...STILL_SOLD },
      select: { detachedFromSku: true },
    });
    return row?.detachedFromSku ?? null;
  }
}
