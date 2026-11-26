import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ReplacedRecapReader } from "../domain/ports/replaced-recap.reader.js";

/** Le récapitulatif qui désigne celui-ci comme son rectificatif (`replaced_by_id`, unique). */
@Injectable()
export class PrismaReplacedRecapReader extends ReplacedRecapReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async numberReplacedBy(recapId: string): Promise<string | null> {
    const row = await this.prisma.inHouseRecap.findUnique({
      where: { replacedById: recapId },
      select: { number: true },
    });
    return row?.number ?? null;
  }
}
