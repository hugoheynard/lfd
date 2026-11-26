import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import type { InHouseRecap } from "../domain/entities/in-house-recap.js";
import { InHouseRecapReader } from "../domain/ports/in-house-recap.reader.js";
import { RECAP_SELECT, toDomain } from "./in-house-recap.mapper.js";

/** Le récapitulatif relu pour l'écran, par le même mapper que le dépôt. */
@Injectable()
export class PrismaInHouseRecapReader extends InHouseRecapReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async load(recapId: string): Promise<InHouseRecap | null> {
    const row = await this.prisma.inHouseRecap.findUnique({
      where: { id: recapId },
      select: RECAP_SELECT,
    });
    return row === null ? null : toDomain(row);
  }
}
