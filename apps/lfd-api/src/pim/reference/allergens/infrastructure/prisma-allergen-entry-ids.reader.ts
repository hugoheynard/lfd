import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { AllergenEntryIdsReader } from "../domain/ports/allergen-entry-ids.reader.js";

/** Un `findMany` sur les codes demandés, dans la transaction de l'appelant quand il y en a une. */
@Injectable()
export class PrismaAllergenEntryIdsReader extends AllergenEntryIdsReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async idsOfCodes(codes: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (codes.length === 0) {
      return new Map();
    }
    const entries = await this.prisma.allergenEntry.findMany({
      where: { code: { in: [...codes] } },
      select: { id: true, code: true },
    });
    return new Map(entries.map((entry) => [entry.code, entry.id]));
  }
}
