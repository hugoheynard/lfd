import { Injectable } from "@nestjs/common";
import type { PriceFloorView } from "@lfd/contracts";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { StaffAuthorDirectory } from "../../../staff/directory/domain/staff-author-directory.js";
import { PriceLimitsReader } from "../application/ports/price-limits.reader.js";
import { referenceCanonicalFor, type ReferenceArticle } from "../application/floor-reference.js";
import { unarchivedAt } from "./archived-at.js";
import { floorFromRow, floorViewFromRow } from "./price-rows.js";
import type { FloorClientele } from "../domain/entities/pricing-floor.js";

/**
 * **Les limites en vigueur d'une clientèle**, telles que la Comptabilité les lit.
 *
 * Même clause que celle des planchers de `PrismaPricingDecisionsReader` — non
 * archivée ET dans sa fenêtre —, la clientèle en plus : sans la fenêtre, une
 * portée re-posée rendrait aussi sa période close, avec son signal de dérive.
 */
@Injectable()
export class PrismaPriceLimitsReader extends PriceLimitsReader {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffAuthors: StaffAuthorDirectory,
  ) {
    super();
  }

  async inForce(
    clientele: FloorClientele,
    at: Date,
    articles: readonly ReferenceArticle[],
  ): Promise<PriceFloorView[]> {
    const rows = await this.prisma.priceFloor.findMany({
      where: {
        AND: [
          unarchivedAt(at),
          { clientele },
          { validFrom: { lte: at } },
          { OR: [{ validTo: null }, { validTo: { gt: at } }] },
        ],
      },
      orderBy: [{ scopeType: "asc" }, { scopeId: "asc" }],
    });
    const authors = await this.staffAuthors.identify(rows.map((row) => row.createdBy));
    return rows.map((row) =>
      floorViewFromRow(row, referenceCanonicalFor(floorFromRow(row).scope, articles), at, authors),
    );
  }
}
